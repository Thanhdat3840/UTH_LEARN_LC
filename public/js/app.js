'use strict';

(function () {
  const Engine = window.UCP600Engine;
  const Parser = window.DocxPdfParser;
  const STORAGE_KEY = 'tradefin_import_lc_simulator_v2';

  const LC_FIELDS = [
    'issuingBankCode', 'customBankName', 'customBankBic', 'customBankBranch', 'customBankAddress',
    'contractNo', 'contractDate', 'lcNumber', 'issueDate', 'form40A',
    'applicantName', 'applicantAddress', 'beneficiaryName', 'beneficiaryAddress',
    'advisingBankName', 'advisingBankBic', 'currency', 'amount', 'tolerancePlus', 'toleranceMinus',
    'incoterms', 'portOfLoading', 'portOfDischarge', 'latestShipmentDate', 'expiryDate', 'expiryPlace',
    'partialShipment', 'transhipment', 'availableBy', 'draftTenor', 'draweeBic', 'goodsDescription',
    'depositPercent', 'debitAccountNo', 'creditFacilityRef', 'exchangeRate', 'customerCif', 'applicantTaxId', 'legalRepName',
    'field45A', 'field46A', 'field47A', 'field48', 'field49', 'field71D'
  ];

  let appState = {
    currentStage: 1,
    currentRole: 'corporate',
    isBankView: false, // Đã xóa bỏ Góc nhìn Ngân hàng: cố định ở Góc độ Doanh nghiệp (isBankView = false)
    autoLcNumber: 'LC2026VCB0088',
    contractRawText: '',
    contractParsed: {},
    lcData: {},
    issuedFlag: false,
    stage3Completed: false,
    amendment: null,
    effectiveLC: null,
    settlementStatus: ''
  };

  function el(id) {
    return document.getElementById(id);
  }

  function formatErrorMessage(err) {
    if (!err) return 'Lỗi không xác định.';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    try { return JSON.stringify(err); } catch (_) { return String(err); }
  }

  function showToast(msg) {
    const box = el('toastBox');
    box.textContent = msg;
    box.classList.add('show');
    clearTimeout(box._t);
    box._t = setTimeout(() => box.classList.remove('show'), 3200);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  // Tự động format số hiển thị có dấu phẩy
  function formatNumberWithCommas(val) {
    const num = Engine.parseNumberSafe(val);
    if (!Number.isFinite(num) || num === 0) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setAmountVal(cleanNum) {
    const num = Engine.parseNumberSafe(cleanNum);
    el('amount').value = num > 0 ? String(num) : '';
    el('amountDisplay').value = num > 0 ? formatNumberWithCommas(num) : '';
    const curr = el('currency').value || 'USD';
    el('amountSwiftFormat').textContent = `SWIFT: ${curr}${Engine.formatSwiftAmount(num)}`;
  }

  function readLcFormFromDom() {
    const data = {};
    for (const key of LC_FIELDS) {
      const node = el(key);
      if (node) data[key] = node.value;
    }
    const bankCode = data.issuingBankCode || 'VCB';
    const cNoSuffix = (data.contractNo || '0088').replace(/[^A-Z0-9]/gi, '').slice(-4).padStart(4, '0');
    const fallbackLcNo = appState.autoLcNumber || `LC2026${bankCode}${cNoSuffix}`.toUpperCase();
    if (!appState.isBankView) {
      data.lcNumber = fallbackLcNo;
    } else if (!data.lcNumber) {
      data.lcNumber = fallbackLcNo;
    }
    data.field78 = 'UPON RECEIPT OF DOCUMENTS STRICTLY COMPLYING WITH THE TERMS AND CONDITIONS OF THIS CREDIT, WE SHALL REMIT PROCEEDS AS PER PRESENTING BANK\'S INSTRUCTIONS WITHIN 05 BANKING DAYS.';
    appState.lcData = data;
    return data;
  }

  function writeLcFormToDom(data, markAutofilledKeys) {
    const markSet = new Set(markAutofilledKeys || []);
    for (const key of LC_FIELDS) {
      const node = el(key);
      if (!node) continue;
      if (key === 'lcNumber') {
        if (data.lcNumber) {
          appState.autoLcNumber = data.lcNumber;
        }
        syncLcNumberDisplay();
        if (!appState.isBankView) {
          continue;
        }
      }
      if (data[key] !== undefined && data[key] !== null) {
        node.value = data[key];
      }
      if (key === 'amount') {
        setAmountVal(data[key]);
      }
      if (markSet.has(key)) {
        node.classList.add('autofilled');
        if (key === 'amount') {
          el('amountDisplay').classList.add('autofilled');
        }
      }
    }
    updateSwiftDateHints();
    validateTimelineDates();
    updateCharCounters();
    checkFieldCharsets();
    checkIncotermsRisks();
  }

  function saveState() {
    readLcFormFromDom();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (_) {}
  }

  function getEffectiveLC() {
    const base = readLcFormFromDom();
    if (appState.amendment && appState.amendment.mt707Text) {
      const res = Engine.generateSwiftMT707(base, appState.amendment);
      appState.effectiveLC = res.effectiveLC;
      return res.effectiveLC;
    }
    appState.effectiveLC = base;
    return base;
  }

  const PENDING_LC_LABEL = 'Chưa cấp (Sau Bước 3)';
  const PENDING_LC_SWIFT = '[CHUA CAP - CHO HOAN THANH BUOC 3]';

  function isLcNumberIssued() {
    return Boolean(appState.stage3Completed);
  }

  function getLcDataForPreview(baseLc) {
    return isLcNumberIssued() ? baseLc : Object.assign({}, baseLc, { lcNumber: PENDING_LC_SWIFT });
  }

  function syncLcNumberDisplay() {
    const lcInput = el('lcNumber');
    if (!lcInput) return;
    if (isLcNumberIssued()) {
      lcInput.value = appState.autoLcNumber || '';
    } else {
      lcInput.value = '';
      lcInput.placeholder = 'Ngân hàng tự cấp sau Bước 3';
      lcInput.classList.remove('autofilled');
    }
  }

  function updateStage3IssueBanner() {
    const banner = el('stage3IssueBanner');
    const statusText = el('stage3IssueStatusText');
    const btnComplete = el('btnCompleteStage3');
    if (!banner || !statusText || !btnComplete) return;

    const eff = getEffectiveLC();
    if (isLcNumberIssued()) {
      banner.style.background = '#ecfdf5';
      banner.style.borderColor = '#6ee7b7';
      banner.style.color = '#065f46';
      statusText.innerHTML = `✅ Đã gửi Đơn Mở L/C & Hoàn thành Bước 3 — Ngân hàng đã cấp Số L/C (:20:): <b>${escapeHtml(eff.lcNumber)}</b> và phát hành điện SWIFT MT700.`;
      btnComplete.style.display = 'none';
    } else {
      banner.style.background = '#fffbeb';
      banner.style.borderColor = '#fcd34d';
      banner.style.color = '#92400e';
      statusText.innerHTML = '⏳ <b>Chưa hoàn thành Bước 3:</b> Số L/C (<code>:20:</code>) chỉ được Ngân hàng phát hành cấp sau khi bạn kiểm tra Đơn Mở L/C và bấm xác nhận gửi đơn.';
      btnComplete.style.display = 'inline-flex';
    }
  }

  function completeStage3AndIssueLc(switchToMt700Tab) {
    appState.stage3Completed = true;
    appState.issuedFlag = true;
    syncLcNumberDisplay();
    updateSummaryStrip();
    renderStage3Outputs();
    if (switchToMt700Tab) {
      const stage3Panel = el('stage-3');
      if (stage3Panel) {
        stage3Panel.querySelectorAll('.subtab-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.subtab === 'tab-swift-mt700');
        });
        stage3Panel.querySelectorAll('.subtab-pane').forEach(p => {
          p.classList.toggle('active', p.id === 'tab-swift-mt700');
        });
      }
    }
    saveState();
  }

  function gotoStage(stageNum) {
    const num = Number(stageNum);
    appState.currentStage = num;
    document.querySelectorAll('.stage-panel').forEach(p => p.classList.remove('active'));
    const target = el('stage-' + num);
    if (target) target.classList.add('active');

    document.querySelectorAll('.step-btn').forEach(btn => {
      const s = Number(btn.dataset.stage);
      btn.classList.toggle('active', s === num);
      btn.classList.toggle('done', s < num);
    });

    if (num === 2) {
      renderFinancialsAndCompliance();
    } else if (num === 3) {
      renderStage3Outputs();
    } else if (num === 4) {
      renderStage4();
    } else if (num === 5) {
      renderStage5Header();
    }
    updateSummaryStrip();
    saveState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateSummaryStrip() {
    const eff = getEffectiveLC();
    const fin = Engine.calculateFinancials(eff);
    const sumLcEl = el('sumLcNumber');
    if (isLcNumberIssued()) {
      sumLcEl.textContent = eff.lcNumber || '—';
      sumLcEl.style.color = '';
      sumLcEl.style.fontWeight = '';
    } else {
      sumLcEl.textContent = PENDING_LC_LABEL;
      sumLcEl.style.color = 'var(--slate-400)';
      sumLcEl.style.fontWeight = '600';
    }
    el('sumStatus').textContent = appState.settlementStatus
      || (appState.amendment
        ? 'Đã tu chỉnh (MT707)'
        : (isLcNumberIssued()
          ? 'Đã phát hành MT700'
          : (appState.currentStage === 3 ? 'Chờ gửi Đơn mở L/C' : 'Đang soạn thảo')));
    el('sumAmount').textContent = eff.amount ? Engine.formatHumanAmount(eff.amount, eff.currency) : '—';
    const pol = (eff.portOfLoading || '').split(',')[0] || '—';
    const pod = (eff.portOfDischarge || '').split(',')[0] || '—';
    el('sumRoute').textContent = `${eff.incoterms || ''} | ${pol} → ${pod}`;
    el('sumDates').textContent = `${eff.latestShipmentDate || '—'} / ${eff.expiryDate || '—'}`;
    el('sumDeposit').textContent = fin.depositAmountForeign > 0
      ? `${fin.depositPercent}% (${Engine.formatHumanAmount(fin.depositAmountForeign, eff.currency)})`
      : `${fin.depositPercent}% (Hạn mức)`;
  }

  function renderHighlightedContract(rawText, extracted) {
    if (!rawText || !rawText.trim()) {
      el('contractHighlightViewer').textContent = 'Chưa có nội dung hợp đồng.';
      return;
    }
    let html = escapeHtml(rawText);
    const terms = [
      extracted.contractNo,
      extracted.applicantName,
      extracted.beneficiaryName,
      extracted.advisingBankBic,
      extracted.portOfLoading,
      extracted.portOfDischarge,
      extracted.incoterms
    ].filter(t => t && String(t).trim().length >= 3);

    for (const term of terms) {
      const safe = String(term).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        html = html.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
      } catch (_) {}
    }
    el('contractHighlightViewer').innerHTML = html;
  }

  function formatDateDdMmYyyy(isoDate) {
    if (!isoDate) return '';
    const m = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoDate;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  // Kiểm tra chéo (Cross-check) chuỗi thời gian theo UCP 600:
  // Ngày ký HĐ <= Ngày phát hành dự kiến (:31C:) <= Ngày giao hàng muộn nhất (:44C:) <= Ngày hết hạn L/C (:31D:)
  function validateTimelineDates() {
    const cDate = el('contractDate') ? el('contractDate').value : '';
    const iDate = el('issueDate') ? el('issueDate').value : '';
    const sDate = el('latestShipmentDate') ? el('latestShipmentDate').value : '';
    const eDate = el('expiryDate') ? el('expiryDate').value : '';

    // 1. Kiểm tra Ngày phát hành dự kiến (:31C:)
    const issueNode = el('issueDate');
    const errIssue = el('errorTooltip_issueDate');
    if (issueNode && errIssue) {
      const isBeforeContract = Boolean(cDate && iDate && iDate < cDate);
      const isAfterShipment = Boolean(sDate && iDate && iDate > sDate);
      if (isBeforeContract || isAfterShipment) {
        const cLabel = cDate ? `${formatDateDdMmYyyy(cDate)} [Ngày ký Hợp đồng]` : '[Ngày ký Hợp đồng]';
        const sLabel = sDate ? `${formatDateDdMmYyyy(sDate)} [Ngày giao hàng muộn nhất]` : '[Ngày giao hàng muộn nhất]';
        errIssue.textContent = `⚠️ Ngày phát hành dự kiến phải nằm trong khoảng từ ${cLabel} đến ${sLabel}`;
        errIssue.style.display = 'block';
        issueNode.classList.add('input-date-error');
      } else {
        errIssue.style.display = 'none';
        errIssue.textContent = '';
        issueNode.classList.remove('input-date-error');
      }
    }

    // 2. Kiểm tra Ngày giao hàng muộn nhất (:44C:) >= Ngày ký Hợp đồng
    const shipNode = el('latestShipmentDate');
    const errShip = el('errorTooltip_latestShipmentDate');
    if (shipNode && errShip) {
      if (cDate && sDate && sDate < cDate) {
        errShip.textContent = `⚠️ Ngày giao hàng muộn nhất (${formatDateDdMmYyyy(sDate)}) không được sớm hơn Ngày ký Hợp đồng (${formatDateDdMmYyyy(cDate)}).`;
        errShip.style.display = 'block';
        shipNode.classList.add('input-date-error');
      } else {
        errShip.style.display = 'none';
        errShip.textContent = '';
        shipNode.classList.remove('input-date-error');
      }
    }

    // 3. Kiểm tra Ngày hết hạn L/C (:31D:) >= Ngày giao hàng muộn nhất (:44C:)
    const expNode = el('expiryDate');
    const errExp = el('errorTooltip_expiryDate');
    if (expNode && errExp) {
      if (sDate && eDate && eDate < sDate) {
        errExp.textContent = `⚠️ Ngày hết hạn L/C (${formatDateDdMmYyyy(eDate)}) phải lớn hơn hoặc bằng Ngày giao hàng muộn nhất (${formatDateDdMmYyyy(sDate)}).`;
        errExp.style.display = 'block';
        expNode.classList.add('input-date-error');
      } else {
        errExp.style.display = 'none';
        errExp.textContent = '';
        expNode.classList.remove('input-date-error');
      }
    }
  }

  // Cập nhật nhãn quy đổi YYMMDD cho SWIFT
  function updateSwiftDateHints() {
    const dates = [
      { id: 'issueDate', hintId: 'hintSwift_issueDate' },
      { id: 'latestShipmentDate', hintId: 'hintSwift_latestShipmentDate' },
      { id: 'expiryDate', hintId: 'hintSwift_expiryDate' }
    ];
    for (const d of dates) {
      const node = el(d.id);
      const hint = el(d.hintId);
      if (node && hint) {
        const swiftD = Engine.toSwiftDate(node.value);
        hint.textContent = swiftD ? `SWIFT: ${swiftD} (YYMMDD)` : 'SWIFT: —';
      }
    }
  }

  // Cập nhật bộ đếm dòng & ký tự
  function updateCharCounters() {
    // 50 Applicant: 4 dòng x 35 ký tự
    const appName = el('applicantName').value || '';
    const appAddr = el('applicantAddress').value || '';
    const appFull = (appName + '\n' + appAddr).trim();
    const appLines = appFull ? appFull.split('\n') : [];
    const maxLineApp = appLines.reduce((m, l) => Math.max(m, l.length), 0);
    const cApp = el('counter_applicant');
    if (cApp) {
      cApp.textContent = `${appLines.length} / 4 dòng (dòng dài nhất: ${maxLineApp}/35 kt)`;
      cApp.classList.toggle('limit-exceeded', appLines.length > 4 || maxLineApp > 35);
    }

    // 59 Beneficiary: 4 dòng x 35 ký tự
    const benName = el('beneficiaryName').value || '';
    const benAddr = el('beneficiaryAddress').value || '';
    const benFull = (benName + '\n' + benAddr).trim();
    const benLines = benFull ? benFull.split('\n') : [];
    const maxLineBen = benLines.reduce((m, l) => Math.max(m, l.length), 0);
    const cBen = el('counter_beneficiary');
    if (cBen) {
      cBen.textContent = `${benLines.length} / 4 dòng (dòng dài nhất: ${maxLineBen}/35 kt)`;
      cBen.classList.toggle('limit-exceeded', benLines.length > 4 || maxLineBen > 35);
    }

    // 44E & 44F: tối đa 65 ký tự
    const polLen = (el('portOfLoading').value || '').length;
    const cPol = el('counter_portOfLoading');
    if (cPol) {
      cPol.textContent = `${polLen} / 65 ký tự`;
      cPol.classList.toggle('limit-exceeded', polLen > 65);
    }

    const podLen = (el('portOfDischarge').value || '').length;
    const cPod = el('counter_portOfDischarge');
    if (cPod) {
      cPod.textContent = `${podLen} / 65 ký tự`;
      cPod.classList.toggle('limit-exceeded', podLen > 65);
    }
  }

  // Kiểm tra bộ ký tự SWIFT X-set
  function checkFieldCharsets() {
    const fields = [
      { id: 'lcNumber', warnId: 'warnCharset_lcNumber' },
      { id: 'advisingBankBic', warnId: 'warnCharset_advisingBankBic' },
      { id: 'portOfLoading', warnId: 'warnCharset_portOfLoading' },
      { id: 'portOfDischarge', warnId: 'warnCharset_portOfDischarge' }
    ];

    for (const f of fields) {
      const val = el(f.id) ? el(f.id).value : '';
      const warnNode = el(f.warnId);
      if (!warnNode) continue;
      const res = Engine.checkSwiftCharacterSet(val);
      if (!res.isValid) {
        warnNode.style.display = 'block';
        warnNode.textContent = `Chứa ký tự không chuẩn SWIFT (${res.invalidChars.join(' ')}). Khuyến nghị gõ tiếng Anh không dấu.`;
      } else {
        warnNode.style.display = 'none';
      }
    }

    // Applicant & Beneficiary
    const appFull = (el('applicantName').value || '') + ' ' + (el('applicantAddress').value || '');
    const resApp = Engine.checkSwiftCharacterSet(appFull);
    const wApp = el('warnCharset_applicant');
    if (wApp) {
      if (!resApp.isValid) {
        wApp.style.display = 'block';
        wApp.textContent = `Chứa ký tự không chuẩn SWIFT (${resApp.invalidChars.join(' ')}). Khuyến nghị dùng tiếng Anh không dấu.`;
      } else {
        wApp.style.display = 'none';
      }
    }

    const benFull = (el('beneficiaryName').value || '') + ' ' + (el('beneficiaryAddress').value || '');
    const resBen = Engine.checkSwiftCharacterSet(benFull);
    const wBen = el('warnCharset_beneficiary');
    if (wBen) {
      if (!resBen.isValid) {
        wBen.style.display = 'block';
        wBen.textContent = `Chứa ký tự không chuẩn SWIFT (${resBen.invalidChars.join(' ')}). Khuyến nghị dùng tiếng Anh không dấu.`;
      } else {
        wBen.style.display = 'none';
      }
    }
  }

  // Cảnh báo thông minh Incoterms & UCP 600
  function checkIncotermsRisks() {
    const incoterm = (el('incoterms').value || 'CIF').toUpperCase();
    const box = el('incotermsRiskAlertBox');
    const textNode = el('incotermsRiskAlertText');
    if (!box || !textNode) return;

    if (incoterm === 'EXW') {
      box.style.display = 'block';
      box.style.borderColor = '#eab308';
      box.style.background = '#fefce8';
      box.style.color = '#854d0e';
      textNode.innerHTML = `
        <b>BẪY NGHIỆP VỤ L/C:</b> Bạn đang chọn điều kiện <b>EXW (Giao tại xưởng)</b>.
        Theo Incoterms 2020, Người bán EXW chỉ có trách nhiệm chuẩn bị hàng tại kho của mình, không làm thủ tục hải quan xuất khẩu và không có nghĩa vụ xếp hàng lên tàu biển.
        Nếu L/C này yêu cầu nộp Vận đơn đường biển Clean Shipped on Board (B/L), Người bán sẽ hoàn toàn phụ thuộc vào hãng tàu của bạn, dẫn đến nguy cơ rất cao bị bất hợp lệ chứng từ.
        <br/>👉 <i>Khuyến cáo ICC:</i> Chuyển sang <b>FCA</b> hoặc yêu cầu Biên bản giao nhận kho / Forwarder Cargo Receipt (FCR).
      `;
    } else if (incoterm === 'FOB') {
      box.style.display = 'block';
      box.style.borderColor = '#3b82f6';
      box.style.background = '#eff6ff';
      box.style.color = '#1e40af';
      textNode.innerHTML = `
        <b>LƯU Ý FOB:</b> Cước vận chuyển đường biển quốc tế do Bên mua (Applicant) trực tiếp chi trả cho Hãng tàu tại cảng đến.
        Vận đơn (Trường :46A:) bắt buộc phải ghi rõ <b>FREIGHT COLLECT</b>. Chứng từ bảo hiểm thuộc trách nhiệm bên mua tại Việt Nam, không yêu cầu người bán xuất trình.
      `;
    } else if (incoterm === 'CIF' || incoterm === 'CIP') {
      box.style.display = 'block';
      box.style.borderColor = '#10b981';
      box.style.background = '#ecfdf5';
      box.style.color = '#065f46';
      textNode.innerHTML = `
        <b>CHUẨN MỰC ${incoterm}:</b> Người bán đã tính tiền cước và bảo hiểm vào giá bán.
        Vận đơn phải ghi <b>FREIGHT PREPAID</b> và Trường :46A: <b>bắt buộc</b> phải yêu cầu Đơn bảo hiểm (Insurance Policy/Certificate) đạt tối thiểu <b>110% giá trị hóa đơn</b> bảo vệ điều kiện A (Institute Cargo Clauses A) theo UCP 600 Điều 28.
      `;
    } else {
      box.style.display = 'none';
    }
  }

  // Ràng buộc bộ 3 thanh toán (41A, 42C, 42A)
  function handlePaymentTenorSync() {
    const avail = el('availableBy').value || 'BY PAYMENT';
    const tenorInput = el('draftTenor');
    const tenorHint = el('tenorHint');

    if (avail === 'BY PAYMENT') {
      tenorInput.value = 'AT SIGHT';
      tenorInput.readOnly = true;
      tenorInput.style.background = '#f1f5f9';
      if (tenorHint) tenorHint.textContent = 'Phương thức Trả ngay: Hối phiếu mặc định AT SIGHT (hoặc không cần hối phiếu).';
    } else if (avail === 'BY ACCEPTANCE') {
      tenorInput.readOnly = false;
      tenorInput.style.background = '#ffffff';
      if (!tenorInput.value || tenorInput.value === 'AT SIGHT') {
        tenorInput.value = '60 DAYS AFTER BILL OF LADING DATE';
      }
      if (tenorHint) tenorHint.textContent = 'Phương thức Chấp nhận: Nhập kỳ hạn trả chậm (VD: 60 DAYS AFTER B/L DATE hoặc 90 DAYS FROM SIGHT).';
    } else if (avail === 'BY DEF PAYMENT') {
      tenorInput.readOnly = false;
      tenorInput.style.background = '#ffffff';
      if (!tenorInput.value || tenorInput.value === 'AT SIGHT') {
        tenorInput.value = '60 DAYS AFTER SHIPMENT DATE (DEFERRED)';
      }
      if (tenorHint) tenorHint.textContent = 'Phương thức Trả chậm không hối phiếu: Cam kết thanh toán sau X ngày từ ngày giao hàng.';
    } else if (avail === 'BY NEGOTIATION') {
      tenorInput.readOnly = false;
      tenorInput.style.background = '#ffffff';
      if (tenorHint) tenorHint.textContent = 'Phương thức Thương lượng: Cho phép Ngân hàng chỉ định mua/chiết khấu hối phiếu đòi tiền.';
    }
  }

  function applyContractAutoFill(rawText, sourceName) {
    appState.contractRawText = rawText;
    el('rawContractInput').value = rawText;
    const parsed = Parser.parseSalesContractText(rawText);
    appState.contractParsed = parsed.extracted;

    const ex = parsed.extracted;
    let issueIso = el('issueDate').value || todayIso();
    if (ex.contractDate && (issueIso < ex.contractDate || (ex.latestShipmentDate && issueIso > ex.latestShipmentDate))) {
      issueIso = ex.contractDate;
    }
    const days48 = ex.presentationDays ? Number(ex.presentationDays) : 15;

    // Mẫu 3 bẫy: nếu trong hợp đồng quy định rõ hạn L/C trùng hạn giao hàng, giữ nguyên bẫy;
    // ngược lại gợi ý Ngày hết hạn L/C (:31D:) = Ngày giao hàng muộn nhất (:44C:) + 15 ngày theo thông lệ UCP 600
    let expiryDate = '';
    const smartHint = el('smartHint_expiryDate');
    if (rawText.includes('L/C Expiry Date is fixed strictly on 20 December 2026') && ex.latestShipmentDate) {
      expiryDate = ex.latestShipmentDate;
      if (smartHint) smartHint.style.display = 'none';
    } else if (ex.latestShipmentDate) {
      expiryDate = Engine.addDaysIso(ex.latestShipmentDate, 15);
      if (smartHint) {
        smartHint.textContent = `💡 Gợi ý thông minh: Tự động cộng +15 ngày từ Ngày giao hàng muộn nhất → ${formatDateDdMmYyyy(expiryDate)} (theo thông lệ UCP 600).`;
        smartHint.style.display = 'block';
      }
    }

    const bankCode = el('issuingBankCode').value || 'VCB';
    const bankInfo = Engine.getBankInfo({ issuingBankCode: bankCode });

    const merged = {
      issuingBankCode: bankCode,
      contractNo: ex.contractNo,
      contractDate: ex.contractDate,
      lcNumber: ex.contractNo ? ('LC2026' + bankCode + ex.contractNo.replace(/[^A-Z0-9]/gi, '').slice(-4)).toUpperCase() : (el('lcNumber').value || 'LC2026VCB0088'),
      issueDate: issueIso,
      form40A: 'IRREVOCABLE',
      applicantName: ex.applicantName,
      applicantAddress: ex.applicantAddress,
      beneficiaryName: ex.beneficiaryName,
      beneficiaryAddress: ex.beneficiaryAddress,
      advisingBankName: ex.advisingBankName,
      advisingBankBic: ex.advisingBankBic || 'SMBCJPJTXXX',
      currency: ex.currency || 'USD',
      amount: ex.amount,
      tolerancePlus: ex.tolerancePlus || '0',
      toleranceMinus: ex.toleranceMinus || '0',
      incoterms: ex.incoterms || 'CIF',
      portOfLoading: ex.portOfLoading,
      portOfDischarge: ex.portOfDischarge,
      latestShipmentDate: ex.latestShipmentDate,
      expiryDate: expiryDate,
      expiryPlace: 'AT BENEFICIARY COUNTRY',
      partialShipment: ex.partialShipment || 'NOT ALLOWED',
      transhipment: ex.transhipment || 'ALLOWED',
      availableBy: ex.availableBy || 'BY PAYMENT',
      draftTenor: ex.draftTenor || 'AT SIGHT',
      draweeBic: bankInfo.shortBic + 'XXX',
      goodsDescription: ex.goodsDescription,
      coType: ex.coType
    };

    const clauses = Engine.buildDefaultMT700Clauses(merged);
    merged.field45A = clauses.field45A;
    merged.field46A = clauses.field46A;
    merged.field47A = clauses.field47A;
    merged.field48 = String(days48);
    merged.field49 = clauses.field49;
    merged.field71D = clauses.field71D;

    const autoFilledKeys = Object.keys(merged).filter(k => merged[k] !== '' && merged[k] !== undefined);
    document.querySelectorAll('.autofilled').forEach(n => n.classList.remove('autofilled'));
    writeLcFormToDom(merged, autoFilledKeys);

    renderHighlightedContract(rawText, ex);
    el('parseStatsBadge').textContent = `${sourceName ? sourceName + ': ' : ''}Đã nhận diện ${parsed.detectedCount} trường`;

    handlePaymentTenorSync();
    appState.amendment = null;
    appState.issuedFlag = false;
    appState.stage3Completed = false;
    appState.settlementStatus = '';
    syncLcNumberDisplay();
    updateSummaryStrip();
    renderFinancialsAndCompliance();
    saveState();
    showToast(`Đã đọc xong hợp đồng và tự động điền ${parsed.detectedCount} trường chuẩn MT700!`);
  }

  function regenerateClausesFromForm() {
    const data = readLcFormFromDom();
    const clauses = Engine.buildDefaultMT700Clauses(data);
    writeLcFormToDom({
      field45A: clauses.field45A,
      field46A: clauses.field46A,
      field47A: clauses.field47A,
      field48: clauses.field48,
      field49: clauses.field49,
      field71D: clauses.field71D
    }, ['field45A', 'field46A', 'field47A', 'field48']);
    renderFinancialsAndCompliance();
    updateSummaryStrip();
    saveState();
    showToast('Đã cập nhật lại các điều khoản 45A, 46A, 47A theo Incoterms hiện tại.');
  }

  function renderFinancialsAndCompliance() {
    const lcData = readLcFormFromDom();
    const fin = Engine.calculateFinancials(lcData);

    el('bankNameBadge').textContent = fin.bank.name;
    el('kpiMaxExposure').textContent = Engine.formatHumanAmount(fin.maxExposure, lcData.currency);
    el('kpiTolPct').textContent = lcData.tolerancePlus || '0';
    el('kpiDepositForeign').textContent = Engine.formatHumanAmount(fin.depositAmountForeign, lcData.currency);
    el('kpiDepositVnd').textContent = `≈ ${fin.depositAmountVnd.toLocaleString('en-US')} VND (${fin.depositPercent}%)`;
    el('kpiCreditLine').textContent = Engine.formatHumanAmount(fin.creditLineUsedForeign, lcData.currency);
    el('kpiBankFees').textContent = `USD ${fin.totalBankFeeUsd.toFixed(2)}`;
    el('kpiBankFeesDetail').textContent = `Phí mở: $${fin.issuanceFeeUsd.toFixed(2)} + SWIFT: $${fin.swiftFeeUsd} (≈ ${fin.totalBankFeeVnd.toLocaleString('en-US')} VND)`;

    const result = Engine.validateLCApplication(lcData, appState.contractParsed);
    const badgeBox = el('complianceBadgeSummary');
    badgeBox.innerHTML = `
      <span class="badge badge-error">${result.summary.errors} Lỗi chặn</span>
      <span class="badge badge-warning">${result.summary.warnings} Cảnh báo rủi ro</span>
      <span class="badge badge-pass">${result.summary.passes} Đạt chuẩn</span>
    `;

    const listEl = el('complianceFindingsList');
    listEl.innerHTML = result.findings.map(f => {
      const label = f.severity === 'ERROR' ? 'LỖI NGHIÊM TRỌNG' : (f.severity === 'WARNING' ? 'CẢNH BÁO RỦI RO' : 'ĐẠT CHUẨN');
      const badgeCls = f.severity === 'ERROR' ? 'badge-error' : (f.severity === 'WARNING' ? 'badge-warning' : 'badge-pass');
      return `
        <div class="finding-item ${f.severity}">
          <div class="finding-head">
            <span class="finding-title">${escapeHtml(f.title)}</span>
            <span class="badge ${badgeCls}">${label} · ${escapeHtml(f.article)}</span>
          </div>
          <div class="finding-detail">${escapeHtml(f.detail)}</div>
          ${f.suggestion ? `<div class="finding-suggestion"><b>Khuyến nghị xử lý:</b> ${escapeHtml(f.suggestion)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderMt700ByMode(lcData, mode, targetEl) {
    const m = mode || 'printed';
    if (!targetEl) return;
    if (m === 'raw') {
      targetEl.className = 'swift-terminal';
      targetEl.textContent = Engine.generateSwiftMT700(lcData);
    } else {
      targetEl.className = 'swift-paper-a4';
      targetEl.textContent = Engine.generateSwiftPrintedMT700(lcData);
    }
  }

  function renderStage3Outputs() {
    const lcData = readLcFormFromDom();
    const mode = appState.mt700DisplayMode || 'printed';
    renderMt700ByMode(getLcDataForPreview(lcData), mode, el('mt700Preview'));
    if (el('btnMt700ModePrinted')) el('btnMt700ModePrinted').classList.toggle('active', mode === 'printed');
    if (el('btnMt700ModeRaw')) el('btnMt700ModeRaw').classList.toggle('active', mode === 'raw');

    const fin = Engine.calculateFinancials(lcData);
    const bank = fin.bank;
    const meta = window.BankTemplates.BANK_META[lcData.issuingBankCode] || window.BankTemplates.BANK_META.OTHER;
    if (el('stage3BankBadge')) {
      el('stage3BankBadge').textContent = `Mẫu: ${bank.code === 'OTHER' ? bank.name : meta.shortLabel} (${meta.formCode})`;
    }
    el('bankApplicationPreview').innerHTML = window.BankTemplates.renderBankApplicationHtml(lcData, fin, { isWordMode: false });
    updateStage3IssueBanner();
  }

  function renderStage4() {
    const base = readLcFormFromDom();
    if (!el('amendmentDate').value) el('amendmentDate').value = todayIso();
    if (!el('sgBlDate').value) el('sgBlDate').value = base.latestShipmentDate || todayIso();

    if (appState.amendment && appState.amendment.mt707Text) {
      el('mt707Preview').textContent = appState.amendment.mt707Text;
    }
  }

  function applyAmendment() {
    const base = readLcFormFromDom();
    const amend = {
      amendmentNumber: Number(el('amendmentNumber').value || 1),
      amendmentDate: el('amendmentDate').value || todayIso(),
      relatedReference: el('amendRelatedRef').value || 'AMEND-01',
      newLatestShipmentDate: el('amendNewShipmentDate').value || '',
      newExpiryDate: el('amendNewExpiryDate').value || '',
      newAmount: el('amendNewAmount').value || '',
      newPortOfLoading: el('amendNewPol').value || '',
      newPortOfDischarge: el('amendNewPod').value || '',
      field45B: el('amendField45B').value || '',
      field46B: el('amendField46B').value || '',
      field47B: el('amendField47B').value || ''
    };

    const res = Engine.generateSwiftMT707(base, amend);
    amend.mt707Text = res.mt707Text;
    appState.amendment = amend;
    appState.effectiveLC = res.effectiveLC;

    el('mt707Preview').textContent = res.mt707Text;
    el('amendNumberBadge').textContent = `Lần tu chỉnh: #${amend.amendmentNumber}`;

    if (Math.abs(res.deltaAmount) > 0.001) {
      const sign = res.deltaAmount > 0 ? '+' : '';
      el('amendDepositDeltaBox').innerHTML = `
        <span class="badge ${res.deltaAmount > 0 ? 'badge-warning' : 'badge-pass'}">
          Biến động giá trị L/C: ${sign}${Engine.formatHumanAmount(res.deltaAmount, base.currency)} |
          Ký quỹ bổ sung: ${Engine.formatHumanAmount(res.additionalDepositForeign, base.currency)}
        </span>`;
    } else {
      el('amendDepositDeltaBox').innerHTML = '<span class="badge badge-info">Tu chỉnh phi tài chính (Không đổi giá trị L/C)</span>';
    }

    updateSummaryStrip();
    saveState();
    showToast('Đã phát hành điện tu chỉnh SWIFT MT707 và cập nhật L/C hiệu lực!');
  }

  function generateShippingGuarantee() {
    const eff = getEffectiveLC();
    const bank = Engine.getBankInfo(eff);
    const sgHtml = `
      <div class="bank-form-header">
        <div>
          <div style="font-weight:700; font-size:14px;">${escapeHtml(bank.name)}</div>
          <div style="font-size:12px;">${escapeHtml(bank.branch)}</div>
        </div>
        <div style="text-align:right; font-size:12px;">
          <div><b>THƯ BẢO LÃNH NHẬN HÀNG (SHIPPING GUARANTEE)</b></div>
          <div>Số tham chiếu: SG-${escapeHtml(eff.lcNumber)}</div>
        </div>
      </div>
      <p><b>Kính gửi (To):</b> ${escapeHtml(el('sgCarrier').value)}</p>
      <p><b>Người nhận hàng / Người mở L/C (Applicant):</b> ${escapeHtml(eff.applicantName)}</p>
      <p>
        Liên quan đến lô hàng nhập khẩu theo Thư tín dụng số <b>${escapeHtml(eff.lcNumber)}</b> trị giá <b>${escapeHtml(Engine.formatHumanAmount(eff.amount, eff.currency))}</b>,
        được vận chuyển trên tàu <b>${escapeHtml(el('sgVessel').value)}</b> theo Vận đơn số <b>${escapeHtml(el('sgBlNumber').value)}</b>
        ngày <b>${escapeHtml(el('sgBlDate').value)}</b>, mô tả lô hàng: <b>${escapeHtml(el('sgCargoDetail').value)}</b>.
      </p>
      <p>
        Do bộ Vận đơn gốc (Original Bill of Lading) chưa về tới ngân hàng trong khi hàng hóa đã cập cảng <b>${escapeHtml(eff.portOfDischarge)}</b>,
        bằng văn bản này, Ngân hàng chúng tôi cùng Công ty <b>${escapeHtml(eff.applicantName)}</b> liên đới cam kết bồi hoàn vô điều kiện cho Quý Hãng tàu mọi tổn thất phát sinh
        khi Quý Hãng tàu giao lô hàng trên cho Người mở L/C mà chưa thu hồi được Vận đơn gốc.
      </p>
      <p>
        Người mở L/C cam kết thanh toán vô điều kiện bộ chứng từ gốc ngay khi chứng từ về tới Ngân hàng (bỏ qua mọi bất hợp lệ nếu đã nhận hàng theo Bảo lãnh này) và nộp lại Vận đơn gốc để giải tỏa Bảo lãnh.
      </p>
      <div class="signature-row">
        <div class="signature-box"><b>ĐẠI DIỆN DOANH NGHIỆP</b><br/><i>(Ký, đóng dấu)</i></div>
        <div class="signature-box"></div>
        <div class="signature-box"><b>ĐẠI DIỆN NGÂN HÀNG PHÁT HÀNH</b><br/><i>(Ký, đóng dấu xác nhận)</i></div>
      </div>
    `;
    el('sgPreview').innerHTML = sgHtml;
    showToast('Đã tạo Thư Bảo lãnh Nhận hàng (Shipping Guarantee).');
  }

  function renderStage5Header() {
    const eff = getEffectiveLC();
    el('eff44CDisplay').value = `${eff.latestShipmentDate || '—'} (Xuất trình tối đa ${eff.field48 || 21} ngày)`;
    el('eff32BDisplay').value = eff.amount ? Engine.formatHumanAmount(eff.amount, eff.currency) : '—';
    if (!el('docPresentationDate').value) {
      el('docPresentationDate').value = eff.latestShipmentDate ? Engine.addDaysIso(eff.latestShipmentDate, 7) : todayIso();
    }
  }

  function readPresentedDocsFromDom() {
    return {
      presentationDate: el('docPresentationDate').value,
      invoice: {
        invoiceNo: el('docInvNo').value,
        date: el('docInvDate').value,
        lcNumber: el('docInvLcNo').value,
        amount: el('docInvAmount').value,
        packages: el('docInvPackages').value,
        currency: el('docInvCurrency').value,
        goodsDescription: el('docInvGoods').value
      },
      billOfLading: {
        blNumber: el('docBlNo').value,
        onBoardDate: el('docBlOnBoardDate').value,
        portOfLoading: el('docBlPol').value,
        portOfDischarge: el('docBlPod').value,
        grossWeight: el('docBlGrossWeight').value,
        packages: el('docBlPackages').value,
        freightTerm: el('docBlFreightTerm').value,
        cleanOnBoard: el('docBlClean').value === 'true'
      },
      packingList: {
        grossWeight: el('docPlGrossWeight').value,
        netWeight: el('docPlNetWeight').value,
        packages: el('docPlPackages').value
      },
      draft: {
        draftNo: el('docDraftNo').value,
        amount: el('docDraftAmount').value,
        tenor: el('docDraftTenor').value
      },
      certificateOfOrigin: {
        coNumber: el('docCoNo').value,
        originCountry: el('docCoOrigin').value,
        grossWeight: el('docCoGrossWeight').value
      },
      insurance: {
        policyNo: el('docInsNo').value,
        issueDate: el('docInsDate').value,
        amount: el('docInsAmount').value,
        missing: !el('docInsAmount').value || Number(el('docInsAmount').value) <= 0
      }
    };
  }

  function clearPresentedDocsDom() {
    const textIds = [
      'docPresentationDate',
      'docInvNo', 'docInvDate', 'docInvLcNo', 'docInvAmount', 'docInvPackages', 'docInvCurrency', 'docInvGoods',
      'docBlNo', 'docBlOnBoardDate', 'docBlPol', 'docBlPod', 'docBlGrossWeight', 'docBlPackages',
      'docPlGrossWeight', 'docPlNetWeight', 'docPlPackages',
      'docDraftNo', 'docDraftAmount', 'docDraftTenor',
      'docCoNo', 'docCoOrigin', 'docCoGrossWeight',
      'docInsNo', 'docInsDate', 'docInsAmount'
    ];
    for (const id of textIds) {
      const node = el(id);
      if (node) {
        node.value = '';
        node.classList.remove('autofilled');
      }
    }
    const selFreight = el('docBlFreightTerm');
    if (selFreight) {
      selFreight.value = 'FREIGHT PREPAID';
      selFreight.classList.remove('autofilled');
    }
    const selClean = el('docBlClean');
    if (selClean) {
      selClean.value = 'true';
      selClean.classList.remove('autofilled');
    }
  }

  function writePresentedDocsToDom(parsedMap) {
    function setDocVal(id, val) {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const node = el(id);
        if (node) {
          node.value = val;
          node.classList.add('autofilled');
        }
      }
    }

    if (parsedMap.adviceOfDocuments) {
      const adv = parsedMap.adviceOfDocuments;
      if (adv.presentationDate) setDocVal('docPresentationDate', adv.presentationDate);
      if (!parsedMap.draft || !parsedMap.draft.amount) {
        parsedMap.draft = Object.assign({
          draftNo: adv.lcNumber || adv.blNumber || 'DRAFT-01',
          amount: adv.amount,
          tenor: adv.tenor || 'AT SIGHT'
        }, parsedMap.draft || {});
      }
    }

    if (parsedMap.invoice) {
      const i = parsedMap.invoice;
      setDocVal('docInvNo', i.invoiceNo);
      setDocVal('docInvDate', i.date);
      setDocVal('docInvLcNo', i.lcNumber);
      setDocVal('docInvAmount', i.amount);
      setDocVal('docInvPackages', i.packages);
      setDocVal('docInvCurrency', i.currency);
      setDocVal('docInvGoods', i.goodsDescription);
    }
    if (parsedMap.billOfLading) {
      const b = parsedMap.billOfLading;
      setDocVal('docBlNo', b.blNumber);
      setDocVal('docBlOnBoardDate', b.onBoardDate);
      setDocVal('docBlPol', b.portOfLoading);
      setDocVal('docBlPod', b.portOfDischarge);
      setDocVal('docBlGrossWeight', b.grossWeight);
      setDocVal('docBlPackages', b.packages);
      if (b.freightTerm) setDocVal('docBlFreightTerm', b.freightTerm);
      if (b.cleanOnBoard !== undefined) setDocVal('docBlClean', b.cleanOnBoard ? 'true' : 'false');
    }
    if (parsedMap.packingList) {
      const p = parsedMap.packingList;
      setDocVal('docPlGrossWeight', p.grossWeight);
      setDocVal('docPlNetWeight', p.netWeight);
      setDocVal('docPlPackages', p.packages);
      // Nếu Invoice chưa có số kiện, đồng bộ từ Packing List hoặc B/L
      if (!el('docInvPackages').value && p.packages) {
        setDocVal('docInvPackages', p.packages);
      }
    }
    if (parsedMap.billOfLading && !el('docInvPackages').value && parsedMap.billOfLading.packages) {
      setDocVal('docInvPackages', parsedMap.billOfLading.packages);
    }
    if (parsedMap.draft) {
      const d = parsedMap.draft;
      setDocVal('docDraftNo', d.draftNo);
      setDocVal('docDraftAmount', d.amount);
      setDocVal('docDraftTenor', d.tenor);
    } else if (parsedMap.invoice && parsedMap.invoice.amount && !el('docDraftAmount').value) {
      setDocVal('docDraftNo', parsedMap.invoice.invoiceNo || parsedMap.invoice.lcNumber || 'DRAFT-01');
      setDocVal('docDraftAmount', parsedMap.invoice.amount);
      setDocVal('docDraftTenor', 'AT SIGHT');
    }
    if (parsedMap.certificateOfOrigin) {
      const c = parsedMap.certificateOfOrigin;
      setDocVal('docCoNo', c.coNumber);
      setDocVal('docCoOrigin', c.originCountry);
      setDocVal('docCoGrossWeight', c.grossWeight);
    }
    if (parsedMap.insurance) {
      const ins = parsedMap.insurance;
      setDocVal('docInsNo', ins.policyNo);
      setDocVal('docInsDate', ins.issueDate);
      setDocVal('docInsAmount', ins.amount);
    }
    if (!parsedMap.adviceOfDocuments && el('docBlOnBoardDate').value) {
      setDocVal('docPresentationDate', Engine.addDaysIso(el('docBlOnBoardDate').value, 10));
    }
  }

  function runDiscrepancyCheck() {
    const eff = getEffectiveLC();
    const docs = readPresentedDocsFromDom();
    const res = Engine.checkDocumentDiscrepancies(eff, docs);

    const badge = el('discrepancyStatusBadge');
    badge.className = 'badge ' + (res.isClean ? 'badge-pass' : 'badge-error');
    badge.textContent = res.statusText;

    let html = '';
    if (res.discrepancies.length > 0) {
      html += res.discrepancies.map((d, idx) => `
        <div class="finding-item ERROR">
          <div class="finding-head">
            <span class="finding-title">Lỗi #${idx + 1} [${escapeHtml(d.docName)}]: ${escapeHtml(d.title)}</span>
            <span class="badge badge-error">${escapeHtml(d.article)}</span>
          </div>
          <div class="finding-detail"><b>Quy định L/C:</b> ${escapeHtml(d.expected)} &nbsp;|&nbsp; <b>Thực tế trên chứng từ:</b> ${escapeHtml(d.actual)}</div>
          <div class="finding-suggestion"><b>Hệ quả pháp lý:</b> ${escapeHtml(d.impact)}</div>
        </div>
      `).join('');
    } else {
      html += `
        <div class="finding-item PASS">
          <div class="finding-head">
            <span class="finding-title">BỘ CHỨNG TỪ HOÀN TOÀN PHÙ HỢP (CLEAN PRESENTATION)</span>
            <span class="badge badge-pass">UCP 600 Điều 14 & 15</span>
          </div>
          <div class="finding-detail">Không phát hiện sai sót nào giữa bộ chứng từ xuất trình và bức điện L/C hiệu lực. Ngân hàng phát hành có nghĩa vụ thanh toán không hủy ngang trong vòng 05 ngày làm việc ngân hàng.</div>
        </div>
      `;
    }

    if (res.checksPassed.length > 0) {
      html += `<h4 style="margin:12px 0 8px;">Các hạng mục đã đối chiếu đạt chuẩn (${res.checksPassed.length})</h4>`;
      html += res.checksPassed.map(p => `
        <div class="finding-item PASS">
          <div class="finding-head">
            <span class="finding-title">[${escapeHtml(p.docName)}] ${escapeHtml(p.title)}</span>
            <span class="badge badge-pass">${escapeHtml(p.article)}</span>
          </div>
          <div class="finding-detail">${escapeHtml(p.note)}</div>
        </div>
      `).join('');
    }

    el('discrepancyResultsBox').innerHTML = html;

    if (!res.isClean) {
      el('mt734Container').style.display = 'block';
      el('mt734Preview').textContent = res.mt734Notice;
      el('importerDecisionBar').style.display = 'block';
      el('finalSettlementResult').textContent = '';
    } else {
      el('mt734Container').style.display = 'none';
      el('importerDecisionBar').style.display = 'block';
      el('finalSettlementResult').innerHTML = `<span style="color:var(--teal-600);">Sẵn sàng giải phóng bộ chứng từ gốc & thanh toán ${Engine.formatHumanAmount(docs.invoice.amount || eff.amount, eff.currency)}.</span>`;
    }
    showToast(res.isClean ? 'Bộ chứng từ hợp lệ 100% (Clean Presentation)!' : `Phát hiện ${res.discrepancies.length} lỗi bất hợp lệ trên bộ chứng từ.`);
  }

  function detectDocTypeByFilenameAndText(filename, text) {
    const f = (filename || '').toLowerCase();
    const t = String(text || '');

    // 1. Ưu tiên nhận diện theo tên file nếu người dùng tải file có đặt tên rõ ràng
    if (f.includes('invoice')) return 'invoice';
    if (f.includes('lading') || /\bbl\d*\b/.test(f)) return 'billOfLading';
    if (f.includes('packing')) return 'packingList';
    if (f.includes('exchange') || f.includes('draft')) return 'draft';
    if (f.includes('origin') || /\bco\b/.test(f)) return 'certificateOfOrigin';
    if (f.includes('insurance')) return 'insurance';

    // 2. Loại trừ các trang L/C MT700, Hợp đồng ngoại thương, C/Q hoặc mặt sau điều khoản dài B/L (BL2.jpg) khi dán hàng loạt ảnh (Ctrl+V)
    if (/Input\s*Message\s*Type\s*:\s*MT700|FORM\s*OF\s*DOCUMENTARY\s*CREDIT|:40A:|:46A:/i.test(t)) return null;
    if (/HEREINAFTER\s+CALLED\s+["“']?THE\s+(?:SELLER|BUYER)|IT\s+IS\s+MUTUALLY\s+AGREED/i.test(t)) return null;
    if (/WERKSBESCHEINIGUNG|ACCEPTANCE\s+TEST\s+CERTIFICATE/i.test(t)) return null;
    if (/(?:the\s+Carrier\s+shall|the\s+Merchant\s+shall|General\s+Average|indemnify\s+the\s+Carrier|in\s+no\s+circumstances\s+be\s+liable|SHIPPER\s+PACKED\s+CONTAINERS)/i.test(t)) {
      return null;
    }

    // 3. Nhận diện Giấy báo nhận hàng (Arrival Notice), Giấy báo chứng từ ngân hàng (Advice) & Shipping Advice
    if (/\bARRIVAL\s+NOTICE\b|GI[ẤA]Y\s*B[ÁA]O\s*NH[ẬA]N\s*H[ÀA]NG|GIAY\s*BAO\s*NHAN\s*HANG/i.test(t)) {
      return 'arrivalNotice';
    }
    if (/GI[ẤA]Y\s*B[ÁA]O\s*CH[ỨU]NG\s*T[ỪƯU]|ADVICE\s*OF\s*ARRIVAL\s*OF\s*DOCUMENTS/i.test(t)) {
      return 'adviceOfDocuments';
    }
    if (/\bSHIPPING\s+ADVIS[EC]\b/i.test(t) || /\bPARTICULARS\s+OF\s+SHIPMENT\b/i.test(t)) {
      return 'shippingAdvice';
    }

    // 4. Nhận diện Phiếu đóng gói (Packing List)
    if (/\bPacking\s*List\s*[:#\-]?\s*\d+|\bPACKING\s+SUMMARY\b|\bDETAILS\s+ITEMS\s+FOR\s+PACKAGE|^packing\s*list\b/im.test(t)) {
      return 'packingList';
    }

    // 5. Nhận diện Hóa đơn thương mại (Commercial Invoice)
    if (/\bCommercial\s*Invoice\s*[:#\-]?\s*\d+|\bTOTAL\s+INVOICE\s+VALUE\b|\bInvoice\s*No\.?\s*[:#\-]\s*[A-Z0-9]+|^commercial\s*invoice\b/im.test(t)) {
      return 'invoice';
    }

    // 6. Nhận diện Vận đơn đường biển (Marine / Ocean Bill of Lading) — bỏ qua mặt sau toàn điều khoản nhỏ (BL2/BL3)
    const hasBlCoreKeyword = /\bOCEAN\s+BILL\s+OF\s+LADING\b|\bShipper\s+B\/L\s+No|\bB\/L\s*No\.?\s*[:#\-]?\s*[A-Z0-9]{5,}|\bConsignee\s+or\s+order\b|^bill\s*of\s*lading\b/im.test(t);
    const hasBlFrontData = /\b(?:Shipper|Port\s*of\s*loading|Port\s*of\s*discharge|Gross\s*weight|FREIGHT\s+(?:COLLECT|PREPAID))\b/i.test(t);
    if (hasBlCoreKeyword && hasBlFrontData && !/\bSHIPPING\s+ADVIS[EC]\b/i.test(t)) {
      return 'billOfLading';
    }

    // 7. Nhận diện Giấy chứng nhận xuất xứ (Certificate of Origin - C/O)
    if (/\bCERTIFICAT\s+D'ORIGINE\b|\bURSPRUNGSZEUGNIS\b|\bCountry\s+of\s+origin\b|\bReference\s*No\.?\s*[:#\-]?\s*[A-Z0-9\-]+\s*\n[\s\S]{0,120}?CERTIFICATE\s*OF\s*ORIGIN|^certificate\s*of\s*origin\b/im.test(t)) {
      return 'certificateOfOrigin';
    }

    // 8. Nhận diện Hối phiếu (Bill of Exchange / Draft)
    if (/\bBILL\s+OF\s+EXCHANGE\b|\bFIRST\s+OF\s+EXCHANGE\b|\bDraft\s*No\.?\s*[:#\-]/im.test(t)) {
      return 'draft';
    }

    // 9. Nhận diện Đơn bảo hiểm (Insurance Policy / Certificate)
    if (/\bINSURANCE\s+(?:POLICY|CERTIFICATE)\b|\bCARGO\s+INSURANCE\b|\bSUM\s+INSURED\b/im.test(t)) {
      return 'insurance';
    }

    return null;
  }

  async function loadSampleDirectoryFolder(folderName) {
    const files = [
      { file: '01_Commercial_Invoice.docx', type: 'invoice' },
      { file: '02_Bill_of_Lading.docx', type: 'billOfLading' },
      { file: '03_Packing_List.docx', type: 'packingList' },
      { file: '04_Bill_of_Exchange.docx', type: 'draft' },
      { file: '05_Certificate_of_Origin.docx', type: 'certificateOfOrigin' },
      { file: '06_Insurance_Policy.docx', type: 'insurance' }
    ];
    const parsedMap = {};
    for (const item of files) {
      const resp = await fetch(`/api/sample-file/${folderName}/${item.file}`);
      if (!resp.ok) continue;
      const ab = await resp.arrayBuffer();
      const text = await Parser.readFileToText({ name: item.file, arrayBuffer: async () => ab });
      parsedMap[item.type] = Parser.parseShippingDocText(text, item.type);
    }
    writePresentedDocsToDom(parsedMap);
    const blDate = el('docBlOnBoardDate').value;
    if (blDate) el('docPresentationDate').value = Engine.addDaysIso(blDate, 5);
    runDiscrepancyCheck();
  }

  async function initSampleDropdown() {
    try {
      const resp = await fetch('/api/samples');
      if (!resp.ok) return;
      const json = await resp.json();
      const contracts = (json.files || []).filter(f => f.path.startsWith('contracts/') && f.name.endsWith('.docx'));
      const sel = el('selectSampleContract');
      sel.innerHTML = '<option value="">-- Tải file Hợp đồng mẫu có sẵn --</option>';

      // Ưu tiên 3 mẫu chuẩn
      const priorityNames = [
        { path: 'contracts/01_Sales_Contract_CIF_Machinery_Japan.docx', label: '1. Mẫu 1 (Chuẩn cơ bản): Máy CNC Nhật Bản (CIF, At Sight)' },
        { path: 'contracts/02_Sales_Contract_FOB_China_Usance.docx', label: '2. Mẫu 2 (Trả chậm & Giao từng phần): Vải sợi TQ (FOB, 60 Days)' },
        { path: 'contracts/03_Sales_Contract_EXW_Trap_Warning.docx', label: '3. Mẫu 3 (Bẫy nghiệp vụ): Cảm biến quang EXW Tokyo (Bẫy B/L & Hạn L/C)' }
      ];

      for (const p of priorityNames) {
        const opt = document.createElement('option');
        opt.value = p.path;
        opt.textContent = p.label;
        sel.appendChild(opt);
      }

      for (const c of contracts) {
        if (!priorityNames.some(p => p.path === c.path) && !c.name.startsWith('01_') && !c.name.startsWith('02_') && !c.name.startsWith('03_')) {
          const opt = document.createElement('option');
          opt.value = c.path;
          opt.textContent = c.name.replace('.docx', '').replace(/_/g, ' ');
          sel.appendChild(opt);
        }
      }
    } catch (_) {}
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Khởi tạo nội dung popup Tooltip
  function initTooltips() {
    document.querySelectorAll('.tooltip-wrap').forEach(wrap => {
      const tag = wrap.dataset.tooltip;
      const info = Engine.SWIFT_TOOLTIPS[tag];
      const content = wrap.querySelector('.tooltip-content');
      if (info && content) {
        content.innerHTML = `
          <h5>${escapeHtml(info.title)}</h5>
          <div class="tt-meaning">${escapeHtml(info.meaning)}</div>
          <div class="tt-warning"><b>Lưu ý UCP 600:</b> ${escapeHtml(info.warning)}</div>
        `;
      }
    });
  }

  // Áp dụng chế độ cố định Góc độ Doanh nghiệp (isBankView = false)
  function applyCorporateRoleUI() {
    appState.currentRole = 'corporate';
    appState.isBankView = false;
    document.body.classList.add('role-corporate');
    document.body.classList.remove('role-bank');

    const lcInput = el('lcNumber');
    if (lcInput) {
      lcInput.placeholder = 'Ngân hàng tự cấp sau Bước 3';
      lcInput.readOnly = true;
      lcInput.disabled = true;
      lcInput.classList.add('input-locked-corporate');
      syncLcNumberDisplay();
    }

    const draweeGroup = el('formGroupDrawee');
    if (draweeGroup) {
      draweeGroup.style.display = 'none';
    }
  }

  function bindEvents() {
    // Modal SWIFT Preview (Printed FIN 700 default + Raw FIN toggle)
    const modal = el('rawSwiftModal');
    let modalMt700Mode = 'printed';
    function updateModalMt700() {
      const lc = getLcDataForPreview(readLcFormFromDom());
      renderMt700ByMode(lc, modalMt700Mode, el('rawSwiftModalText'));
      if (el('btnModalMt700Printed')) el('btnModalMt700Printed').classList.toggle('active', modalMt700Mode === 'printed');
      if (el('btnModalMt700Raw')) el('btnModalMt700Raw').classList.toggle('active', modalMt700Mode === 'raw');
    }
    el('btnOpenRawSwiftModal').addEventListener('click', () => {
      modalMt700Mode = 'printed';
      updateModalMt700();
      modal.classList.add('active');
    });
    if (el('btnModalMt700Printed')) {
      el('btnModalMt700Printed').addEventListener('click', () => {
        modalMt700Mode = 'printed';
        updateModalMt700();
      });
    }
    if (el('btnModalMt700Raw')) {
      el('btnModalMt700Raw').addEventListener('click', () => {
        modalMt700Mode = 'raw';
        updateModalMt700();
      });
    }
    el('btnCloseRawSwiftModal').addEventListener('click', () => modal.classList.remove('active'));
    el('btnCloseRawSwiftModal2').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });

    el('btnCopyRawSwiftModal').addEventListener('click', async () => {
      await navigator.clipboard.writeText(el('rawSwiftModalText').textContent);
      showToast('Đã copy bức điện SWIFT MT700 vào Clipboard.');
    });

    // Amount Display input & auto-format with commas
    const amtDisp = el('amountDisplay');
    amtDisp.addEventListener('blur', () => {
      const clean = Engine.parseNumberSafe(amtDisp.value);
      setAmountVal(clean);
      updateSummaryStrip();
      if (appState.currentStage === 2) renderFinancialsAndCompliance();
      saveState();
    });
    amtDisp.addEventListener('input', () => {
      amtDisp.classList.remove('autofilled');
      const clean = Engine.parseNumberSafe(amtDisp.value);
      el('amount').value = clean > 0 ? String(clean) : '';
      const curr = el('currency').value || 'USD';
      el('amountSwiftFormat').textContent = `SWIFT: ${curr}${Engine.formatSwiftAmount(clean)}`;
    });

    // Payment method & tenor sync
    el('availableBy').addEventListener('change', handlePaymentTenorSync);

    // Incoterms change -> Cảnh báo & Tự cập nhật 45A
    el('incoterms').addEventListener('change', () => {
      checkIncotermsRisks();
      const term = el('incoterms').value;
      const f45 = el('field45A');
      if (f45 && f45.value) {
        // Thay thế hoặc thêm TERMS OF DELIVERY
        if (/TERMS OF DELIVERY:\s*[A-Z]{3}/i.test(f45.value)) {
          f45.value = f45.value.replace(/TERMS OF DELIVERY:\s*[A-Z]{3}/i, `TERMS OF DELIVERY: ${term}`);
        }
      }
      updateSummaryStrip();
      saveState();
    });

    // Stepper & Go-to buttons
    document.querySelectorAll('.step-btn').forEach(btn => {
      btn.addEventListener('click', () => gotoStage(btn.dataset.stage));
    });
    document.querySelectorAll('[data-goto-stage]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.completeStage3 === 'true' && !isLcNumberIssued()) {
          completeStage3AndIssueLc(false);
          showToast(`Đã hoàn thành Bước 3! Ngân hàng đã cấp số L/C (:20:): ${readLcFormFromDom().lcNumber}`);
        }
        gotoStage(btn.dataset.gotoStage);
      });
    });

    // Subtabs
    document.querySelectorAll('.subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.stage-panel') || document;
        parent.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
        parent.querySelectorAll('.subtab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = el(btn.dataset.subtab);
        if (target) target.classList.add('active');
      });
    });

    // Live updates on form fields
    for (const key of LC_FIELDS) {
      const node = el(key);
      if (!node) continue;

      // Khi người dùng gõ tay -> Xóa highlight autofilled
      node.addEventListener('input', () => {
        node.classList.remove('autofilled');
        updateSwiftDateHints();
        validateTimelineDates();
        updateCharCounters();
        checkFieldCharsets();
        updateSummaryStrip();
        if (appState.currentStage === 2) renderFinancialsAndCompliance();
        saveState();
      });

      node.addEventListener('change', () => {
        if (key === 'issuingBankCode' || key === 'customBankBic' || key === 'customBankName') {
          toggleCustomBankFields();
          const bank = Engine.getBankInfo(readLcFormFromDom());
          el('draweeBic').value = bank.shortBic + 'XXX';
          const cNoSuffix = (el('contractNo').value || '0088').replace(/[^A-Z0-9]/gi, '').slice(-4).padStart(4, '0');
          appState.autoLcNumber = `LC2026${el('issuingBankCode').value || 'VCB'}${cNoSuffix}`.toUpperCase();
          syncLcNumberDisplay();
          if (key === 'issuingBankCode') {
            showToast(`Đã chọn mẫu biểu Ngân hàng: ${bank.name}`);
          }
        }
        if (key === 'latestShipmentDate' && node.value) {
          // Gợi ý thông minh: Tự động cộng +15 ngày cho Ngày hết hạn L/C (:31D:)
          const suggestedExpiry = Engine.addDaysIso(node.value, 15);
          if (suggestedExpiry && el('expiryDate')) {
            el('expiryDate').value = suggestedExpiry;
            el('expiryDate').classList.add('autofilled');
            const smartHint = el('smartHint_expiryDate');
            if (smartHint) {
              smartHint.textContent = `💡 Gợi ý thông minh: Tự động cộng +15 ngày từ Ngày giao hàng muộn nhất → ${formatDateDdMmYyyy(suggestedExpiry)} (theo thông lệ UCP 600).`;
              smartHint.style.display = 'block';
            }
          }
        }
        if (key === 'expiryDate') {
          const smartHint = el('smartHint_expiryDate');
          if (smartHint) smartHint.style.display = 'none';
        }
        if (key === 'currency') {
          const num = Engine.parseNumberSafe(el('amount').value);
          el('amountSwiftFormat').textContent = `SWIFT: ${node.value}${Engine.formatSwiftAmount(num)}`;
        }
        updateSwiftDateHints();
        validateTimelineDates();
        updateCharCounters();
        checkFieldCharsets();
        updateSummaryStrip();
        if (appState.currentStage === 2) renderFinancialsAndCompliance();
        saveState();
      });
    }

    // Contract Dropzone, Multi-Image / File Staging Queue & Ctrl+V Paste
    let stage1Queue = [];
    let stage5Queue = [];

    function renderStageQueue(stageNum) {
      const isStage1 = stageNum === 1;
      const queue = isStage1 ? stage1Queue : stage5Queue;
      const box = el(isStage1 ? 'stage1QueueBox' : 'stage5QueueBox');
      const grid = el(isStage1 ? 'stage1QueueGrid' : 'stage5QueueGrid');
      const badge = el(isStage1 ? 'stage1QueueCountBadge' : 'stage5QueueCountBadge');
      const status = el(isStage1 ? 'stage1QueueStatusText' : 'stage5QueueStatusText');
      if (!box || !grid) return;

      if (queue.length === 0) {
        box.style.display = 'none';
        grid.innerHTML = '';
        return;
      }

      box.style.display = 'block';
      if (badge) {
        badge.textContent = `${queue.length} trang ảnh/file chờ phân tích`;
      }
      if (status) {
        status.textContent = 'Bạn có thể nhấn Ctrl+V để dán thêm trang tiếp theo hoặc bấm dấu ✕ ở góc phải trên để bỏ ảnh thừa trước khi bấm Phân tích.';
      }

      grid.innerHTML = queue.map((item, idx) => {
        const ext = (item.name.split('.').pop() || 'FILE').toUpperCase();
        const thumbHtml = item.isImage
          ? `<img src="${item.previewUrl}" alt="${escapeHtml(item.name)}" />`
          : `<div class="paste-queue-doc-icon">📄 ${escapeHtml(ext)}</div>`;
        return `
          <div class="paste-queue-item" data-queue-item-id="${item.id}">
            <span class="queue-item-page-badge">Trang #${idx + 1}</span>
            <button type="button" class="queue-item-remove-btn" data-remove-stage="${stageNum}" data-remove-id="${item.id}" title="Xóa ảnh/file này">✕</button>
            <div class="paste-queue-thumb">${thumbHtml}</div>
            <div class="paste-queue-meta" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
          </div>
        `;
      }).join('');

      grid.querySelectorAll('[data-remove-id]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const rmId = btn.dataset.removeId;
          const st = Number(btn.dataset.removeStage);
          const targetArr = st === 1 ? stage1Queue : stage5Queue;
          const foundIdx = targetArr.findIndex(x => x.id === rmId);
          if (foundIdx !== -1) {
            if (targetArr[foundIdx].previewUrl) URL.revokeObjectURL(targetArr[foundIdx].previewUrl);
            targetArr.splice(foundIdx, 1);
            renderStageQueue(st);
            showToast('Đã xóa 1 trang khỏi hàng đợi.');
          }
        });
      });
    }

    function clearStageQueue(stageNum) {
      const targetArr = stageNum === 1 ? stage1Queue : stage5Queue;
      for (const item of targetArr) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      targetArr.length = 0;
      renderStageQueue(stageNum);
    }

    function addFilesToStageQueue(stageNum, rawFiles) {
      const files = Array.from(rawFiles || []).filter(Boolean);
      if (files.length === 0) return;
      const targetArr = stageNum === 1 ? stage1Queue : stage5Queue;

      for (const f of files) {
        const mime = (f.type || '').toLowerCase();
        const rawName = f.name || '';
        const isImg = mime.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(rawName);
        const ext = isImg ? (rawName.split('.').pop() || 'png') : (rawName.split('.').pop() || 'txt');
        const displayName = (rawName && rawName !== 'image.png' && rawName !== 'blob')
          ? rawName
          : `Anh_Chup_Trang_${targetArr.length + 1}.${ext}`;
        const previewUrl = isImg ? URL.createObjectURL(f) : '';
        targetArr.push({
          id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          file: f,
          name: displayName,
          isImage: isImg,
          previewUrl
        });
      }

      renderStageQueue(stageNum);
      showToast(`Đã thêm ${files.length} trang vào hàng đợi (Tổng: ${targetArr.length}). Bấm "Phân tích" khi bạn đã chọn đủ trang!`);
    }

    async function analyzeStage1Queue() {
      if (stage1Queue.length === 0) {
        return showToast('Hàng đợi đang trống. Hãy nhấn Ctrl+V dán ảnh hoặc chọn file trước.');
      }
      const btn = el('btnAnalyzeStage1Queue');
      const status = el('stage1QueueStatusText');
      const origBtnText = btn ? btn.textContent : '';
      if (btn) btn.disabled = true;

      try {
        const parts = [];
        for (let i = 0; i < stage1Queue.length; i++) {
          const item = stage1Queue[i];
          if (btn) btn.textContent = `⏳ Đang phân tích trang ${i + 1}/${stage1Queue.length}...`;
          if (status) status.textContent = `Đang đọc dữ liệu trang ${i + 1}/${stage1Queue.length}: ${item.name}...`;
          const pageText = await Parser.readFileToText(item.file, pct => {
            if (status) {
              status.textContent = `🔍 Đang nhận diện chữ OCR trang ${i + 1}/${stage1Queue.length} (${item.name}): ${pct}%`;
            }
          });
          if (pageText && pageText.trim()) {
            parts.push(pageText.trim());
          }
        }
        const combinedText = parts.join('\n\n');
        if (!combinedText.trim()) {
          showToast('Không nhận diện được chữ từ các ảnh/file đã chọn.');
          return;
        }
        applyContractAutoFill(combinedText, `Hàng đợi ${stage1Queue.length} trang`);
        if (status) {
          status.textContent = `✅ Đã hoàn tất phân tích & ghép nối dữ liệu từ ${stage1Queue.length} trang!`;
        }
      } catch (err) {
        const msg = formatErrorMessage(err);
        if (status) status.textContent = `❌ Lỗi: ${msg}`;
        showToast('Lỗi khi phân tích hàng đợi: ' + msg);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = origBtnText || '🔍 Phân tích & Auto-fill các trang đã chọn';
        }
      }
    }

    async function analyzeStage5Queue() {
      if (stage5Queue.length === 0) {
        return showToast('Hàng đợi chứng từ đang trống. Hãy nhấn Ctrl+V dán ảnh hoặc chọn file trước.');
      }
      const btn = el('btnAnalyzeStage5Queue');
      const status = el('stage5QueueStatusText');
      const origBtnText = btn ? btn.textContent : '';
      if (btn) btn.disabled = true;

      try {
        const map = {};
        const ocrDebugLines = [];
        let shippingAdviceData = null;
        let arrivalNoticeData = null;
        for (let i = 0; i < stage5Queue.length; i++) {
          const item = stage5Queue[i];
          if (btn) btn.textContent = `⏳ Đang đọc trang ${i + 1}/${stage5Queue.length}...`;
          const text = await Parser.readFileToText(item.file, pct => {
            if (status) {
              status.textContent = `🔍 Đang nhận diện chữ OCR chứng từ ${i + 1}/${stage5Queue.length} (${item.name}): ${pct}%`;
            }
          });
          const docType = detectDocTypeByFilenameAndText(item.name, text);
          let extractedSummary = '(Không có)';
          if (docType === 'shippingAdvice') {
            const parsedSa = Parser.parseShippingDocText(text, 'shippingAdvice');
            shippingAdviceData = Object.assign({}, shippingAdviceData || {}, parsedSa);
            extractedSummary = Object.entries(parsedSa).filter(([_, v]) => v !== '' && v !== undefined && v !== null).map(([k, v]) => `${k}=${v}`).join(', ') || '(Trống)';
          } else if (docType === 'arrivalNotice') {
            const parsedAn = Parser.parseShippingDocText(text, 'arrivalNotice');
            arrivalNoticeData = Object.assign({}, arrivalNoticeData || {}, parsedAn);
            extractedSummary = Object.entries(parsedAn).filter(([_, v]) => v !== '' && v !== undefined && v !== null).map(([k, v]) => `${k}=${v}`).join(', ') || '(Trống)';
          } else if (docType) {
            const parsedDoc = Parser.parseShippingDocText(text, docType);
            const prevDoc = map[docType] || {};
            const cleanedEntries = Object.fromEntries(
              Object.entries(parsedDoc).filter(([_, v]) => v !== '' && v !== undefined && v !== null)
            );
            extractedSummary = Object.entries(cleanedEntries).map(([k, v]) => `${k}=${v}`).join(', ') || '(Trống)';
            const mergedDoc = Object.assign({}, prevDoc, cleanedEntries);
            if (docType === 'billOfLading' && prevDoc.cleanOnBoard === true && !parsedDoc.remarks) {
              mergedDoc.cleanOnBoard = true;
            }
            map[docType] = mergedDoc;
          }
          ocrDebugLines.push(
            `=== Trang #${i + 1} (${item.name}) -> Phân loại: ${docType || 'Bỏ qua'} | Trích xuất: ${extractedSummary} ===\n${String(text || '').trim().slice(0, 400)}`
          );
        }

        // Bổ sung các trường còn trống trên B/L và Invoice từ Shipping Advice & Arrival Notice (không ghi đè dữ liệu gốc)
        if (shippingAdviceData) {
          map.billOfLading = map.billOfLading || {};
          for (const k of ['blNumber', 'onBoardDate', 'portOfDischarge', 'portOfLoading']) {
            if (!map.billOfLading[k] && shippingAdviceData[k]) {
              map.billOfLading[k] = shippingAdviceData[k];
            }
          }
          map.invoice = map.invoice || {};
          for (const k of ['invoiceNo', 'amount', 'currency', 'lcNumber']) {
            if (!map.invoice[k] && shippingAdviceData[k]) {
              map.invoice[k] = shippingAdviceData[k];
            }
          }
        }
        if (arrivalNoticeData) {
          map.billOfLading = map.billOfLading || {};
          for (const k of ['blNumber', 'grossWeight', 'portOfLoading', 'portOfDischarge']) {
            if (!map.billOfLading[k] && arrivalNoticeData[k]) {
              map.billOfLading[k] = arrivalNoticeData[k];
            }
          }
        }

        // Khôi phục dấu chấm thập phân bị OCR mất (VD: 438400 -> 4384.00 khi khớp đúng 100x với Packing List)
        const blGw = map.billOfLading && map.billOfLading.grossWeight;
        const plGw = map.packingList && map.packingList.grossWeight;
        if (blGw && !String(blGw).includes('.') && String(blGw).endsWith('00') && plGw && Math.abs(Number(blGw) / 100 - Number(plGw)) < 0.01) {
          map.billOfLading.grossWeight = (Number(blGw) / 100).toFixed(2);
        }

        clearPresentedDocsDom();
        writePresentedDocsToDom(map);

        const dbgBox = el('stage5OcrDebugBox');
        const dbgContent = el('stage5OcrDebugContent');
        if (dbgBox && dbgContent) {
          dbgContent.textContent = ocrDebugLines.join('\n\n');
          dbgBox.style.display = 'block';
        }

        const coreDocKeys = ['invoice', 'billOfLading', 'packingList', 'draft', 'certificateOfOrigin', 'insurance'];
        const detectedCoreCount = coreDocKeys.filter(k => map[k] && Object.values(map[k]).some(v => v !== '' && v !== undefined && v !== null)).length;
        if (status) {
          status.textContent = `✅ Đã phân loại và điền dữ liệu cho ${detectedCoreCount} loại chứng từ từ ${stage5Queue.length} trang!`;
        }
        showToast(`Đã tự động phân loại và điền dữ liệu cho ${detectedCoreCount} chứng từ.`);
      } catch (err) {
        const msg = formatErrorMessage(err);
        if (status) status.textContent = `❌ Lỗi: ${msg}`;
        showToast('Lỗi phân tích chứng từ: ' + msg);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = origBtnText || '🔍 Phân tích & Điền dữ liệu Chứng từ';
        }
      }
    }

    // Lắng nghe sự kiện Ctrl+V (paste) toàn trang để dán nhiều ảnh chụp màn hình / file vào Hàng đợi
    window.addEventListener('paste', e => {
      const cd = e.clipboardData;
      if (!cd) return;
      const pastedFiles = [];
      if (cd.items && cd.items.length > 0) {
        for (let i = 0; i < cd.items.length; i++) {
          const it = cd.items[i];
          if (it.kind === 'file') {
            const f = it.getAsFile();
            if (f) pastedFiles.push(f);
          }
        }
      } else if (cd.files && cd.files.length > 0) {
        pastedFiles.push(...Array.from(cd.files));
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        if (appState.currentStage === 5) {
          addFilesToStageQueue(5, pastedFiles);
        } else {
          if (appState.currentStage !== 1) gotoStage(1);
          addFilesToStageQueue(1, pastedFiles);
        }
      }
    });

    const dz = el('contractDropzone');
    const fileInput = el('contractFileInput');
    dz.addEventListener('click', () => fileInput.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFilesToStageQueue(1, e.dataTransfer.files);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        addFilesToStageQueue(1, fileInput.files);
      }
      fileInput.value = '';
    });

    if (el('btnAnalyzeStage1Queue')) {
      el('btnAnalyzeStage1Queue').addEventListener('click', analyzeStage1Queue);
    }
    if (el('btnClearStage1Queue')) {
      el('btnClearStage1Queue').addEventListener('click', () => {
        clearStageQueue(1);
        showToast('Đã xóa toàn bộ hàng đợi ảnh/file ở mục 1A.');
      });
    }

    el('btnParseContractText').addEventListener('click', async () => {
      const txt = el('rawContractInput').value;
      if (stage1Queue.length > 0 && !txt.trim()) {
        return await analyzeStage1Queue();
      }
      if (!txt.trim()) return showToast('Vui lòng dán ảnh (Ctrl+V) vào hàng đợi hoặc dán văn bản Hợp đồng vào khung trước.');
      applyContractAutoFill(txt, 'Văn bản nhập tay');
    });

    el('btnLoadSampleContract').addEventListener('click', async () => {
      const rel = el('selectSampleContract').value;
      if (!rel) return showToast('Hãy chọn 1 file Hợp đồng mẫu từ danh sách.');
      try {
        const resp = await fetch(`/api/sample-file/${rel}`);
        const ab = await resp.arrayBuffer();
        const text = await Parser.readFileToText({ name: rel, arrayBuffer: async () => ab });
        applyContractAutoFill(text, rel.split('/').pop());
      } catch (err) {
        showToast('Không thể tải file mẫu: ' + formatErrorMessage(err));
      }
    });

    el('btnRegenerateClauses').addEventListener('click', regenerateClausesFromForm);
    el('btnAutoClauses2').addEventListener('click', regenerateClausesFromForm);

    // Proceed from Stage 2 -> Stage 3
    el('btnProceedToStage3').addEventListener('click', () => {
      const res = Engine.validateLCApplication(readLcFormFromDom(), appState.contractParsed);
      if (!res.summary.canIssue) {
        showToast(`Đang có ${res.summary.errors} Lỗi Nghiêm trọng (ERROR) ở cột 2C! Hãy xử lý trước khi lập Đơn Mở L/C.`);
        return;
      }
      gotoStage(3);
      showToast('Hồ sơ hợp lệ! Vui lòng kiểm tra Đơn Mở L/C ở Bước 3 và bấm "Gửi Đơn Mở L/C" để Ngân hàng cấp số L/C.');
    });

    if (el('btnCompleteStage3')) {
      el('btnCompleteStage3').addEventListener('click', () => {
        const res = Engine.validateLCApplication(readLcFormFromDom(), appState.contractParsed);
        if (!res.summary.canIssue) {
          showToast(`Đang có ${res.summary.errors} Lỗi Nghiêm trọng ở Bước 2! Hãy quay lại xử lý trước khi gửi Đơn Mở L/C.`);
          return;
        }
        completeStage3AndIssueLc(true);
        showToast(`Đã gửi Đơn Mở L/C & Hoàn thành Bước 3! Ngân hàng đã cấp Số L/C (:20:): ${readLcFormFromDom().lcNumber}`);
      });
    }

    // Stage 3 actions
    if (el('btnOpenOriginalBankPdf')) {
      el('btnOpenOriginalBankPdf').addEventListener('click', () => {
        const code = el('issuingBankCode').value || 'VCB';
        const meta = (window.BankTemplates && window.BankTemplates.BANK_META && (window.BankTemplates.BANK_META[code] || window.BankTemplates.BANK_META.OTHER)) || {};
        if (!meta.pdfSample) {
          showToast('Chưa có file PDF mẫu cho ngân hàng này.');
          return;
        }
        window.open(meta.pdfSample, '_blank', 'noopener');
      });
    }
    if (el('btnMt700ModePrinted')) {
      el('btnMt700ModePrinted').addEventListener('click', () => {
        appState.mt700DisplayMode = 'printed';
        renderStage3Outputs();
      });
    }
    if (el('btnMt700ModeRaw')) {
      el('btnMt700ModeRaw').addEventListener('click', () => {
        appState.mt700DisplayMode = 'raw';
        renderStage3Outputs();
      });
    }
    el('btnDownloadMt700').addEventListener('click', () => {
      const lc = getLcDataForPreview(readLcFormFromDom());
      const mode = appState.mt700DisplayMode || 'printed';
      const content = mode === 'raw' ? Engine.generateSwiftMT700(lc) : Engine.generateSwiftPrintedMT700(lc);
      const suffix = mode === 'raw' ? 'MT700_RAW' : 'FIN700_PRINTED';
      const filePrefix = isLcNumberIssued() ? lc.lcNumber : 'DRAFT_CHUA_CAP_SO_LC';
      downloadTextFile(`${filePrefix}_${suffix}.txt`, content);
    });
    el('btnCopyMt700').addEventListener('click', async () => {
      await navigator.clipboard.writeText(el('mt700Preview').textContent);
      showToast('Đã copy toàn bộ bức điện SWIFT MT700 vào Clipboard.');
    });
    el('btnDownloadBankAppWord').addEventListener('click', () => {
      const baseLc = readLcFormFromDom();
      const lcForWord = isLcNumberIssued() ? baseLc : Object.assign({}, baseLc, { lcNumber: 'DRAFT' });
      const fin = Engine.calculateFinancials(baseLc);
      const wordHtml = window.BankTemplates.buildWordDocumentHtml(lcForWord, fin);
      const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const bankCode = baseLc.issuingBankCode || 'VCB';
      a.download = `Don_De_Nghi_Mo_LC_${bankCode}_${isLcNumberIssued() ? baseLc.lcNumber : 'DRAFT'}.doc`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Đã tải xuống Đơn Mở L/C chuẩn mẫu ${bankCode} (.doc Word)!`);
    });
    el('btnPrintApplication').addEventListener('click', () => {
      const isMt700TabActive = el('tab-swift-mt700') && el('tab-swift-mt700').classList.contains('active');
      if (isMt700TabActive) {
        appState.mt700DisplayMode = 'printed';
        renderStage3Outputs();
      }
      window.print();
    });

    // Stage 4 actions
    el('btnApplyAmendment').addEventListener('click', applyAmendment);
    el('btnClearAmendment').addEventListener('click', () => {
      appState.amendment = null;
      el('mt707Preview').textContent = 'Đã hủy tu chỉnh. L/C quay về trạng thái MT700 gốc.';
      el('amendDepositDeltaBox').innerHTML = '';
      updateSummaryStrip();
      saveState();
    });
    el('btnDownloadMt707').addEventListener('click', () => {
      if (!appState.amendment || !appState.amendment.mt707Text) return showToast('Chưa có bức điện MT707 để tải.');
      const lc = readLcFormFromDom();
      downloadTextFile(`${lc.lcNumber || 'SWIFT'}_MT707.txt`, appState.amendment.mt707Text);
    });
    el('btnGenerateSG').addEventListener('click', generateShippingGuarantee);
    el('btnPrintSG').addEventListener('click', () => window.print());

    // Stage 5 actions
    el('btnLoadSampleDiscrepant').addEventListener('click', () => loadSampleDirectoryFolder('shipping_docs_discrepant'));
    el('btnLoadSampleClean').addEventListener('click', () => loadSampleDirectoryFolder('shipping_docs_clean'));
    el('btnRunDiscrepancyCheck').addEventListener('click', runDiscrepancyCheck);

    document.querySelectorAll('.single-doc-upload').forEach(inp => {
      inp.addEventListener('change', async () => {
        const f = inp.files[0];
        if (!f) return;
        try {
          showToast(`Đang đọc dữ liệu từ ${f.name}...`);
          const text = await Parser.readFileToText(f);
          const docType = inp.dataset.docType;
          const parsed = Parser.parseShippingDocText(text, docType);
          writePresentedDocsToDom({ [docType]: parsed });
          showToast(`Đã đọc và điền dữ liệu từ file ${f.name}`);
        } catch (err) {
          showToast('Lỗi đọc file chứng từ: ' + formatErrorMessage(err));
        }
        inp.value = '';
      });
    });

    const dz5 = el('stage5Dropzone');
    if (dz5) {
      dz5.addEventListener('click', () => el('multiShippingDocsInput').click());
      dz5.addEventListener('dragover', e => { e.preventDefault(); dz5.classList.add('dragover'); });
      dz5.addEventListener('dragleave', () => dz5.classList.remove('dragover'));
      dz5.addEventListener('drop', e => {
        e.preventDefault();
        dz5.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          addFilesToStageQueue(5, e.dataTransfer.files);
        }
      });
    }

    el('multiShippingDocsInput').addEventListener('change', () => {
      const files = Array.from(el('multiShippingDocsInput').files || []);
      if (files.length > 0) {
        addFilesToStageQueue(5, files);
      }
      el('multiShippingDocsInput').value = '';
    });

    if (el('btnAnalyzeStage5Queue')) {
      el('btnAnalyzeStage5Queue').addEventListener('click', analyzeStage5Queue);
    }
    if (el('btnClearStage5Queue')) {
      el('btnClearStage5Queue').addEventListener('click', () => {
        clearStageQueue(5);
        showToast('Đã xóa toàn bộ hàng đợi chứng từ ở mục 5A.');
      });
    }

    el('btnWaiveAndPay').addEventListener('click', () => {
      const eff = getEffectiveLC();
      const bank = Engine.getBankInfo(eff);
      const invAmt = Engine.parseNumberSafe(el('docInvAmount').value || eff.amount);
      const netPay = Math.max(0, invAmt - bank.discrepancyFeeUsd);
      appState.settlementStatus = 'Đã Waive & Thanh toán';
      el('finalSettlementResult').innerHTML = `
        <span style="color:var(--teal-600);">
          ĐÃ CHẤP NHẬN BỘ CHỨNG TỪ & THANH TOÁN: Ngân hàng giải phóng Bộ chứng từ gốc (B/L ký hậu) cho Nhà nhập khẩu đi nhận hàng.
          Số tiền chuyển trả người bán sau khi trừ phí bất hợp lệ (USD ${bank.discrepancyFeeUsd}): <b>${Engine.formatHumanAmount(netPay, eff.currency)}</b>.
        </span>`;
      updateSummaryStrip();
      saveState();
    });

    el('btnRefuseDocs').addEventListener('click', () => {
      appState.settlementStatus = 'Đã Từ chối (MT734)';
      el('finalSettlementResult').innerHTML = `
        <span style="color:var(--red-600);">
          ĐÃ TỪ CHỐI BỘ CHỨNG TỪ: Ngân hàng giữ bộ chứng từ theo điện MT734 và yêu cầu Người bán xuất trình chứng từ thay thế hoặc thỏa thuận giảm giá.
        </span>`;
      updateSummaryStrip();
      saveState();
    });

    // Save / Load / Reset JSON
    el('btnExportJson').addEventListener('click', () => {
      saveState();
      const lc = readLcFormFromDom();
      downloadTextFile(`${lc.lcNumber || 'LC_Profile'}.json`, JSON.stringify(appState, null, 2));
    });
    el('inputImportJson').addEventListener('change', async () => {
      const f = el('inputImportJson').files[0];
      if (!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        appState = Object.assign(appState, parsed, {
          currentRole: 'corporate',
          isBankView: false
        });
        if (parsed.stage3Completed === undefined) {
          appState.stage3Completed = Boolean(parsed.issuedFlag && Number(parsed.currentStage || 1) >= 4);
        } else {
          appState.stage3Completed = Boolean(parsed.stage3Completed);
        }
        appState.issuedFlag = appState.stage3Completed;
        writeLcFormToDom(appState.lcData || {});
        applyCorporateRoleUI();
        toggleCustomBankFields();
        validateTimelineDates();
        if (appState.contractRawText) {
          el('rawContractInput').value = appState.contractRawText;
          renderHighlightedContract(appState.contractRawText, appState.contractParsed || {});
        }
        syncLcNumberDisplay();
        updateSummaryStrip();
        gotoStage(appState.currentStage || 1);
        showToast('Đã khôi phục toàn bộ hồ sơ L/C từ file JSON.');
      } catch (err) {
        showToast('File JSON không hợp lệ: ' + formatErrorMessage(err));
      }
      el('inputImportJson').value = '';
    });

    el('btnResetAll').addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });
  }

  function toggleCustomBankFields() {
    const box = el('customBankFields');
    if (box) {
      box.style.display = el('issuingBankCode').value === 'OTHER' ? 'block' : 'none';
    }
  }

  function bootstrap() {
    el('issueDate').value = todayIso();
    applyCorporateRoleUI();
    bindEvents();
    initTooltips();
    initSampleDropdown();
    toggleCustomBankFields();
    handlePaymentTenorSync();
    updateSwiftDateHints();
    validateTimelineDates();
    updateCharCounters();
    checkFieldCharsets();
    checkIncotermsRisks();

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.lcData) {
          appState = Object.assign(appState, parsed, {
            currentRole: 'corporate',
            isBankView: false
          });
          if (parsed.stage3Completed === undefined) {
            appState.stage3Completed = Boolean(parsed.issuedFlag && Number(parsed.currentStage || 1) >= 4);
          } else {
            appState.stage3Completed = Boolean(parsed.stage3Completed);
          }
          appState.issuedFlag = appState.stage3Completed;
          writeLcFormToDom(appState.lcData);
          applyCorporateRoleUI();
          toggleCustomBankFields();
          if (appState.contractRawText) {
            el('rawContractInput').value = appState.contractRawText;
            renderHighlightedContract(appState.contractRawText, appState.contractParsed || {});
          }
        }
      } catch (_) {}
    } else {
      setAmountVal(125000);
    }

    if (!el('field45A').value && !el('field46A').value) {
      const defaults = Engine.buildDefaultMT700Clauses(readLcFormFromDom());
      writeLcFormToDom(defaults);
    }

    applyCorporateRoleUI();
    syncLcNumberDisplay();
    validateTimelineDates();
    updateSummaryStrip();
    gotoStage(appState.currentStage || 1);
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
