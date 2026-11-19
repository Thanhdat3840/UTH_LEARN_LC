(function () {
  'use strict';

  const MV = window.MaritimeValidation;

  const state = {
    activeTab: 'dashboard',
    activeDocView: 'bl',
    carrierLine: 'ONE',
    activeBookingNo: '',
    currentShipment: null,
    shipmentsList: [],
    siContainers: [],
    vgmContainers: [],
    bulkTarget: 'si'
  };

  // ---------- Helpers ----------
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => el.classList.add('hidden'), 3400);
  }

  function toLocalDatetimeInputValue(date) {
    const d = date ? new Date(date) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatStatusBadge(status, type) {
    const val = status || 'NOT_STARTED';
    let cls = 'badge-neutral';
    if (val === 'SUBMITTED' || val === 'FINAL_CONFIRMED') cls = 'badge-success';
    else if (val === 'DRAFT' || val === 'DRAFT_ISSUED') cls = 'badge-warn';
    else if (val === 'NOT_STARTED' && type === 'vgm') cls = 'badge-danger';
    return `<span class="badge ${cls}">${escapeHtml(val)}</span>`;
  }

  async function apiFetch(url, options) {
    const res = await fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, options || {}));
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data: json };
  }

  // ---------- Carrier Profile & Theme ----------
  function applyCarrierProfile(carrierCode) {
    const code = MV.CARRIER_PROFILES[carrierCode] ? carrierCode : 'ONE';
    state.carrierLine = code;
    const profile = MV.CARRIER_PROFILES[code];
    document.documentElement.style.setProperty('--carrier-accent', profile.accentColor);
    $('header-scac').textContent = profile.scac;
    $('header-portal-name').textContent = profile.portalName;
    $('header-carrier-legal').textContent = `${profile.name} — Documentation & SOLAS VGM Module`;
    $('global-carrier-select').value = code;
    if ($('si-carrier')) $('si-carrier').value = code;
    if ($('vgm-carrier')) $('vgm-carrier').value = code;
  }

  // ---------- Tabs & Navigation ----------
  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-view').forEach((sec) => {
      sec.classList.toggle('hidden', sec.id !== `tab-${tabName}`);
    });
    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'docs') renderDocumentCenter();
  }

  // ---------- Sync Bar Status ----------
  function updateSyncStatusStrip() {
    const s = state.currentShipment;
    const bBadge = $('badge-sync-booking');
    const siBadge = $('badge-sync-si');
    const vgmBadge = $('badge-sync-vgm');
    const blBadge = $('badge-sync-bl');

    if (!state.activeBookingNo) {
      bBadge.textContent = 'NO ACTIVE BOOKING';
      bBadge.className = 'badge badge-neutral';
      siBadge.textContent = 'SI: NOT_STARTED';
      siBadge.className = 'badge badge-neutral';
      vgmBadge.textContent = 'VGM: NOT_STARTED';
      vgmBadge.className = 'badge badge-neutral';
      blBadge.textContent = 'B/L: NONE';
      blBadge.className = 'badge badge-neutral';
      return;
    }

    bBadge.textContent = `BKG: ${state.activeBookingNo}`;
    bBadge.className = 'badge badge-info';

    if (!s) {
      siBadge.textContent = 'SI: NEW (UNSAVED)';
      siBadge.className = 'badge badge-neutral';
      vgmBadge.textContent = 'VGM: NEW (UNSAVED)';
      vgmBadge.className = 'badge badge-neutral';
      blBadge.textContent = 'B/L: NONE';
      blBadge.className = 'badge badge-neutral';
      return;
    }

    siBadge.textContent = `SI: ${s.siStatus}${s.siVersion ? ` v${s.siVersion}` : ''}`;
    siBadge.className = `badge ${s.siStatus === 'SUBMITTED' ? 'badge-success' : s.siStatus === 'DRAFT' ? 'badge-warn' : 'badge-neutral'}`;

    vgmBadge.textContent = `VGM: ${s.vgmStatus}${s.vgmVersion ? ` v${s.vgmVersion}` : ''}`;
    vgmBadge.className = `badge ${s.vgmStatus === 'SUBMITTED' ? 'badge-success' : 'badge-danger'}`;

    blBadge.textContent = `B/L: ${s.blStatus}`;
    blBadge.className = `badge ${s.blStatus === 'FINAL_CONFIRMED' ? 'badge-success' : s.blStatus === 'DRAFT_ISSUED' ? 'badge-warn' : 'badge-neutral'}`;
  }

  // ---------- Dashboard ----------
  async function loadDashboard() {
    const { ok, data } = await apiFetch('/api/shipments');
    if (!ok) return;
    state.shipmentsList = data.shipments || [];
    renderDashboard();
  }

  function renderDashboard() {
    const list = state.shipmentsList;
    const query = ($('dashboard-search').value || '').trim().toUpperCase();
    const filtered = query
      ? list.filter((item) =>
        item.bookingNo.includes(query) ||
        (item.blNo || '').includes(query) ||
        (item.vesselName || '').includes(query) ||
        (item.portOfLoading || '').includes(query) ||
        (item.portOfDischarge || '').includes(query))
      : list;

    $('kpi-total').textContent = String(list.length);
    $('kpi-pending-vgm').textContent = String(list.filter((s) => s.vgmStatus !== 'SUBMITTED').length);
    $('kpi-draft-bl').textContent = String(list.filter((s) => s.blStatus === 'DRAFT_ISSUED').length);
    $('kpi-final-bl').textContent = String(list.filter((s) => s.blStatus === 'FINAL_CONFIRMED').length);

    const tbody = $('dashboard-tbody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="muted" style="text-align:center; padding:26px;">No shipments recorded in database yet. Click "+ New e-SI" or "+ New VGM" to start from your documents.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((s) => {
      const route = s.portOfLoading || s.portOfDischarge
        ? `${escapeHtml(s.portOfLoading || '—')} &rarr; ${escapeHtml(s.portOfDischarge || '—')}`
        : '<span class="muted">Pending SI</span>';
      const vessel = s.vesselName ? `${escapeHtml(s.vesselName)} / ${escapeHtml(s.voyageNo)}` : '—';
      return `
        <tr>
          <td class="mono"><strong>${escapeHtml(s.bookingNo)}</strong></td>
          <td class="mono">${escapeHtml(s.carrierLine)}</td>
          <td class="mono">${escapeHtml(s.blNo || '—')}</td>
          <td>${vessel}</td>
          <td>${route}</td>
          <td class="mono">${s.containerCount}</td>
          <td class="mono">${s.totalCargoKgm.toFixed(2)} / ${s.totalVgmKgm.toFixed(2)}</td>
          <td>${formatStatusBadge(s.siStatus, 'si')}${s.siVersion ? ` <span class="mono muted">v${s.siVersion}</span>` : ''}</td>
          <td>${formatStatusBadge(s.vgmStatus, 'vgm')}${s.vgmVersion ? ` <span class="mono muted">v${s.vgmVersion}</span>` : ''}</td>
          <td>${formatStatusBadge(s.blStatus, 'bl')}</td>
          <td>
            <div style="display:flex; gap:4px; flex-wrap:nowrap;">
              <button type="button" class="btn btn-sm" data-action="open-si" data-bkg="${escapeHtml(s.bookingNo)}">SI</button>
              <button type="button" class="btn btn-sm" data-action="open-vgm" data-bkg="${escapeHtml(s.bookingNo)}">VGM</button>
              <button type="button" class="btn btn-sm btn-navy" data-action="open-docs" data-bkg="${escapeHtml(s.bookingNo)}">Docs</button>
              <button type="button" class="btn btn-sm btn-danger-outline" data-action="del-bkg" data-bkg="${escapeHtml(s.bookingNo)}">Del</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ---------- Load / Sync Shipment ----------
  async function loadAndSyncBooking(bookingNoInput, targetTab) {
    const bookingNo = MV.normalizeBookingNo(bookingNoInput);
    if (!bookingNo) {
      showToast('Enter a Booking No. to load or start.');
      return;
    }
    state.activeBookingNo = bookingNo;
    $('active-booking-input').value = bookingNo;
    $('si-booking-no').value = bookingNo;
    $('vgm-booking-no').value = bookingNo;

    const { ok, status, data } = await apiFetch(`/api/shipments/${encodeURIComponent(bookingNo)}`);
    if (ok && data.shipment) {
      state.currentShipment = data.shipment;
      applyCarrierProfile(data.shipment.carrierLine);
      populateSiFromShipment(data.shipment);
      populateVgmFromShipment(data.shipment);
      showToast(`Synchronized Booking ${bookingNo} from SQLite.`);
    } else if (status === 404) {
      state.currentShipment = null;
      resetSiFormKeepingBooking(bookingNo);
      resetVgmFormKeepingBooking(bookingNo);
      showToast(`Initialized new blank Booking ${bookingNo}.`);
    }

    updateSyncStatusStrip();
    updateCrossSyncBanners();
    if (targetTab) switchTab(targetTab);
    else if (state.activeTab === 'docs') renderDocumentCenter();
  }

  function startNewBlankBooking(targetTab) {
    state.activeBookingNo = '';
    state.currentShipment = null;
    $('active-booking-input').value = '';
    resetSiFormKeepingBooking('');
    resetVgmFormKeepingBooking('');
    updateSyncStatusStrip();
    updateCrossSyncBanners();
    if (targetTab) switchTab(targetTab);
  }

  // ---------- EDI Line/Char Meters ----------
  function updateEdiMeter(textareaId, meterId, maxLines, maxLineLen) {
    const el = $(textareaId);
    const meter = $(meterId);
    if (!el || !meter) return;
    const text = el.value || '';
    const lines = text.length === 0 ? [] : text.split(/\r?\n/);
    const maxLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
    meter.textContent = `${lines.length}/${maxLines} lines | ${maxLen}/${maxLineLen} ch`;
    const isOver = lines.length > maxLines || maxLen > maxLineLen;
    meter.classList.toggle('over', isOver);
    el.classList.toggle('input-error', isOver);
  }

  function refreshAllEdiMeters() {
    updateEdiMeter('si-shipper', 'meter-shipper', 5, 35);
    updateEdiMeter('si-consignee', 'meter-consignee', 5, 35);
    updateEdiMeter('si-notify', 'meter-notify', 5, 35);
    updateEdiMeter('si-marks', 'meter-marks', 15, 25);
    updateEdiMeter('si-goods-desc', 'meter-goods', 30, 48);
  }

  // ---------- e-SI Form State & Rendering ----------
  function createEmptySiContainer() {
    return {
      containerNo: '',
      sealNo: '',
      sizeType: '40HC',
      packageCount: '',
      packageType: 'CARTONS',
      cargoGrossWeightKgm: '',
      measurementCbm: ''
    };
  }

  function resetSiFormKeepingBooking(bookingNo) {
    clearErrors('si');
    $('si-booking-no').value = bookingNo;
    $('si-carrier').value = state.carrierLine;
    $('si-bl-type').value = 'ORIGINAL';
    $('si-no-originals').value = '3';
    $('si-freight-terms').value = 'PREPAID';
    $('si-place-issue').value = '';
    $('si-vessel').value = '';
    $('si-voyage').value = '';
    $('si-por').value = '';
    $('si-pol').value = '';
    $('si-pod').value = '';
    $('si-del').value = '';
    $('si-shipper').value = '';
    $('si-consignee').value = '';
    $('si-notify').value = '';
    $('si-hs-code').value = '';
    $('si-special-clauses').value = '';
    $('si-marks').value = '';
    $('si-goods-desc').value = '';
    $('si-amendment-reason').value = '';
    $('si-amendment-wrap').classList.add('hidden');
    $('btn-si-save-draft').classList.remove('hidden');
    $('btn-si-submit').textContent = 'Submit Shipping Instruction';
    $('si-form-mode-badge').textContent = 'NEW SUBMISSION';
    $('si-form-mode-badge').className = 'badge badge-neutral';

    state.siContainers = [createEmptySiContainer()];
    renderSiContainers();
    refreshAllEdiMeters();
  }

  function populateSiFromShipment(shipment) {
    clearErrors('si');
    const si = shipment.siData;
    if (!si) {
      resetSiFormKeepingBooking(shipment.bookingNo);
      // Pre-fill vessel/voyage/containers from VGM if available
      if (shipment.vgmData) {
        $('si-vessel').value = shipment.vgmData.vesselName || '';
        $('si-voyage').value = shipment.vgmData.voyageNo || '';
        state.siContainers = (shipment.vgmData.containers || []).map((vc) => {
          const inferredCargo = vc.method === 'METHOD_2'
            ? MV.round2((vc.cargoWeightKgm || 0) + (vc.dunnageWeightKgm || 0))
            : MV.round2((vc.vgmWeightKgm || 0) - (vc.tareWeightKgm || 0));
          return {
            containerNo: vc.containerNo,
            sealNo: '',
            sizeType: vc.sizeType,
            packageCount: '',
            packageType: 'CARTONS',
            cargoGrossWeightKgm: inferredCargo > 0 ? inferredCargo : '',
            measurementCbm: ''
          };
        });
        if (state.siContainers.length === 0) state.siContainers = [createEmptySiContainer()];
        renderSiContainers();
      }
      return;
    }

    $('si-booking-no').value = si.bookingNo || shipment.bookingNo;
    $('si-carrier').value = si.carrierLine || shipment.carrierLine;
    $('si-bl-type').value = si.blType || 'ORIGINAL';
    $('si-no-originals').value = si.noOfOriginals !== undefined ? String(si.noOfOriginals) : '3';
    $('si-freight-terms').value = si.freightTerms || 'PREPAID';
    $('si-place-issue').value = si.placeOfIssue || '';
    $('si-vessel').value = si.vesselName || '';
    $('si-voyage').value = si.voyageNo || '';
    $('si-por').value = si.placeOfReceipt || '';
    $('si-pol').value = si.portOfLoading || '';
    $('si-pod').value = si.portOfDischarge || '';
    $('si-del').value = si.placeOfDelivery || '';
    $('si-shipper').value = si.shipper || '';
    $('si-consignee').value = si.consignee || '';
    $('si-notify').value = si.notifyParty || '';
    $('si-hs-code').value = si.hsCode || '';
    $('si-special-clauses').value = si.specialClauses || '';
    $('si-marks').value = si.marksAndNumbers || '';
    $('si-goods-desc').value = si.goodsDescription || '';
    $('si-amendment-reason').value = '';

    const isSubmitted = shipment.siStatus === 'SUBMITTED';
    $('si-amendment-wrap').classList.toggle('hidden', !isSubmitted);
    $('btn-si-save-draft').classList.toggle('hidden', isSubmitted);
    $('btn-si-submit').textContent = isSubmitted ? 'Submit SI Amendment' : 'Submit Shipping Instruction';
    $('si-form-mode-badge').textContent = isSubmitted ? `AMENDMENT MODE (CURRENT v${shipment.siVersion})` : 'DRAFT LOADED';
    $('si-form-mode-badge').className = `badge ${isSubmitted ? 'badge-warn' : 'badge-info'}`;

    state.siContainers = Array.isArray(si.containers) && si.containers.length > 0
      ? si.containers.map((c) => Object.assign({}, c))
      : [createEmptySiContainer()];
    renderSiContainers();
    refreshAllEdiMeters();
  }

  function renderSiContainers() {
    const tbody = $('si-containers-tbody');
    const sizeOptions = Object.keys(MV.EQUIPMENT_SPECS).map((k) =>
      `<option value="${k}">${k} (${MV.EQUIPMENT_SPECS[k].isoCode})</option>`
    ).join('');
    const pkgOptions = MV.PACKAGE_TYPES.map((p) => `<option value="${p}">${p}</option>`).join('');

    tbody.innerHTML = state.siContainers.map((c, idx) => {
      const iso = c.containerNo ? MV.validateContainerNumber(c.containerNo) : null;
      let isoPill = '<span class="row-valid-pill" style="background:#f1f5f9;color:#64748b;">11-CHAR ISO 6346</span>';
      if (iso) {
        isoPill = iso.valid
          ? `<span class="row-valid-pill ok">ISO OK (CD: ${iso.expectedCheckDigit})</span>`
          : `<span class="row-valid-pill err">${iso.expectedCheckDigit !== undefined ? `INVALID CD (EXP: ${iso.expectedCheckDigit})` : 'INVALID ISO'}</span>`;
      }

      return `
        <tr data-si-row="${idx}">
          <td class="mono">${idx + 1}</td>
          <td style="min-width:165px;">
            <input type="text" class="mono si-c-no ${iso && !iso.valid ? 'input-error' : ''}" value="${escapeHtml(c.containerNo)}" placeholder="CSQU3054383" maxlength="11">
            <div class="si-iso-status">${isoPill}</div>
          </td>
          <td style="min-width:120px;">
            <input type="text" class="mono si-c-seal" value="${escapeHtml(c.sealNo)}" placeholder="SL992011">
          </td>
          <td style="min-width:115px;">
            <select class="si-c-size">${sizeOptions}</select>
          </td>
          <td style="min-width:85px;">
            <input type="number" min="1" step="1" class="mono si-c-pkgs" value="${escapeHtml(c.packageCount)}" placeholder="500">
          </td>
          <td style="min-width:115px;">
            <select class="si-c-pkgtype">${pkgOptions}</select>
          </td>
          <td style="min-width:120px;">
            <input type="number" min="0" step="0.01" class="mono si-c-weight" value="${escapeHtml(c.cargoGrossWeightKgm)}" placeholder="18500">
          </td>
          <td style="min-width:100px;">
            <input type="number" min="0" step="0.01" class="mono si-c-cbm" value="${escapeHtml(c.measurementCbm)}" placeholder="42.50">
          </td>
          <td>
            <button type="button" class="btn btn-sm btn-danger-outline si-c-remove" ${state.siContainers.length === 1 ? 'disabled' : ''}>Remove</button>
          </td>
        </tr>
      `;
    }).join('');

    state.siContainers.forEach((c, idx) => {
      const tr = tbody.querySelector(`tr[data-si-row="${idx}"]`);
      if (!tr) return;
      tr.querySelector('.si-c-size').value = c.sizeType || '40HC';
      tr.querySelector('.si-c-pkgtype').value = c.packageType || 'CARTONS';
    });

    updateSiTotals();
  }

  function updateSiTotals() {
    let totalPkgs = 0;
    let totalWeight = 0;
    let totalCbm = 0;
    state.siContainers.forEach((c) => {
      totalPkgs += Number(c.packageCount) || 0;
      totalWeight += Number(c.cargoGrossWeightKgm) || 0;
      totalCbm += Number(c.measurementCbm) || 0;
    });
    $('si-total-cntrs').textContent = String(state.siContainers.length);
    $('si-total-pkgs').textContent = String(totalPkgs);
    $('si-total-weight').textContent = MV.round2(totalWeight).toFixed(2);
    $('si-total-cbm').textContent = MV.round2(totalCbm).toFixed(2);
  }

  function collectSiPayload() {
    return {
      bookingNo: MV.normalizeBookingNo($('si-booking-no').value),
      carrierLine: $('si-carrier').value,
      blType: $('si-bl-type').value,
      noOfOriginals: Number($('si-no-originals').value),
      freightTerms: $('si-freight-terms').value,
      placeOfIssue: $('si-place-issue').value,
      vesselName: $('si-vessel').value,
      voyageNo: $('si-voyage').value,
      placeOfReceipt: $('si-por').value,
      portOfLoading: $('si-pol').value,
      portOfDischarge: $('si-pod').value,
      placeOfDelivery: $('si-del').value,
      shipper: $('si-shipper').value,
      consignee: $('si-consignee').value,
      notifyParty: $('si-notify').value,
      hsCode: $('si-hs-code').value,
      specialClauses: $('si-special-clauses').value,
      marksAndNumbers: $('si-marks').value,
      goodsDescription: $('si-goods-desc').value,
      amendmentReason: $('si-amendment-reason').value,
      containers: state.siContainers.map((c) => ({
        containerNo: MV.normalizeUpper(c.containerNo),
        sealNo: MV.normalizeUpper(c.sealNo),
        sizeType: c.sizeType,
        packageCount: c.packageCount === '' ? 0 : Number(c.packageCount),
        packageType: c.packageType,
        cargoGrossWeightKgm: c.cargoGrossWeightKgm === '' ? 0 : Number(c.cargoGrossWeightKgm),
        measurementCbm: c.measurementCbm === '' ? 0 : Number(c.measurementCbm)
      }))
    };
  }

  // ---------- SOLAS VGM Form State & Rendering ----------
  function createEmptyVgmContainer() {
    const spec = MV.EQUIPMENT_SPECS['40HC'];
    return {
      containerNo: '',
      sizeType: '40HC',
      method: 'METHOD_2',
      cargoWeightKgm: '',
      dunnageWeightKgm: '0',
      tareWeightKgm: String(spec.defaultTareKgm),
      maxGrossWeightKgm: String(spec.maxGrossWeightKgm),
      vgmWeightKgm: ''
    };
  }

  function resetVgmFormKeepingBooking(bookingNo) {
    clearErrors('vgm');
    $('vgm-booking-no').value = bookingNo;
    $('vgm-carrier').value = state.carrierLine;
    $('vgm-vessel').value = '';
    $('vgm-voyage').value = '';
    $('vgm-auth-person').value = '';
    $('vgm-company').value = '';
    $('vgm-weighbridge-ref').value = '';
    $('vgm-timestamp').value = toLocalDatetimeInputValue(new Date());
    $('vgm-amendment-reason').value = '';
    $('vgm-amendment-wrap').classList.add('hidden');
    $('vgm-solas-checkbox').checked = false;
    $('btn-vgm-submit').textContent = 'Submit SOLAS VGM';
    $('vgm-form-mode-badge').textContent = 'NEW DECLARATION';
    $('vgm-form-mode-badge').className = 'badge badge-neutral';

    state.vgmContainers = [createEmptyVgmContainer()];
    renderVgmContainers();
  }

  function populateVgmFromShipment(shipment) {
    clearErrors('vgm');
    const vgm = shipment.vgmData;
    if (!vgm) {
      resetVgmFormKeepingBooking(shipment.bookingNo);
      if (shipment.siData) {
        $('vgm-vessel').value = shipment.siData.vesselName || '';
        $('vgm-voyage').value = shipment.siData.voyageNo || '';
        state.vgmContainers = (shipment.siData.containers || []).map((sc) => {
          const spec = MV.EQUIPMENT_SPECS[sc.sizeType] || MV.EQUIPMENT_SPECS['40HC'];
          const cargoWt = Number(sc.cargoGrossWeightKgm) || 0;
          const totalVgm = MV.round2(cargoWt + spec.defaultTareKgm);
          return {
            containerNo: sc.containerNo,
            sizeType: sc.sizeType,
            method: 'METHOD_2',
            cargoWeightKgm: String(cargoWt),
            dunnageWeightKgm: '0',
            tareWeightKgm: String(spec.defaultTareKgm),
            maxGrossWeightKgm: String(spec.maxGrossWeightKgm),
            vgmWeightKgm: String(totalVgm)
          };
        });
        if (state.vgmContainers.length === 0) state.vgmContainers = [createEmptyVgmContainer()];
        renderVgmContainers();
      }
      return;
    }

    $('vgm-booking-no').value = vgm.bookingNo || shipment.bookingNo;
    $('vgm-carrier').value = vgm.carrierLine || shipment.carrierLine;
    $('vgm-vessel').value = vgm.vesselName || '';
    $('vgm-voyage').value = vgm.voyageNo || '';
    $('vgm-auth-person').value = vgm.authorizedPerson || '';
    $('vgm-company').value = vgm.declarantCompany || '';
    $('vgm-weighbridge-ref').value = vgm.weighbridgeRef || '';
    $('vgm-timestamp').value = vgm.weighingDateTime ? vgm.weighingDateTime.slice(0, 16) : toLocalDatetimeInputValue(new Date());
    $('vgm-solas-checkbox').checked = Boolean(vgm.solasDeclarationAccepted);
    $('vgm-amendment-reason').value = '';

    const isSubmitted = shipment.vgmStatus === 'SUBMITTED';
    $('vgm-amendment-wrap').classList.toggle('hidden', !isSubmitted);
    $('btn-vgm-submit').textContent = isSubmitted ? 'Submit VGM Amendment' : 'Submit SOLAS VGM';
    $('vgm-form-mode-badge').textContent = isSubmitted ? `AMENDMENT MODE (CURRENT v${shipment.vgmVersion})` : 'NEW DECLARATION';
    $('vgm-form-mode-badge').className = `badge ${isSubmitted ? 'badge-warn' : 'badge-neutral'}`;

    state.vgmContainers = Array.isArray(vgm.containers) && vgm.containers.length > 0
      ? vgm.containers.map((c) => ({
        containerNo: c.containerNo,
        sizeType: c.sizeType,
        method: c.method,
        cargoWeightKgm: String(c.cargoWeightKgm ?? ''),
        dunnageWeightKgm: String(c.dunnageWeightKgm ?? '0'),
        tareWeightKgm: String(c.tareWeightKgm ?? ''),
        maxGrossWeightKgm: String(c.maxGrossWeightKgm ?? ''),
        vgmWeightKgm: String(c.vgmWeightKgm ?? '')
      }))
      : [createEmptyVgmContainer()];
    renderVgmContainers();
  }

  function renderVgmContainers() {
    const tbody = $('vgm-containers-tbody');
    const sizeOptions = Object.keys(MV.EQUIPMENT_SPECS).map((k) =>
      `<option value="${k}">${k} (${MV.EQUIPMENT_SPECS[k].isoCode})</option>`
    ).join('');

    tbody.innerHTML = state.vgmContainers.map((c, idx) => {
      const iso = c.containerNo ? MV.validateContainerNumber(c.containerNo) : null;
      let isoPill = '<span class="row-valid-pill" style="background:#f1f5f9;color:#64748b;">11-CHAR ISO 6346</span>';
      if (iso) {
        isoPill = iso.valid
          ? `<span class="row-valid-pill ok">ISO OK (CD: ${iso.expectedCheckDigit})</span>`
          : `<span class="row-valid-pill err">${iso.expectedCheckDigit !== undefined ? `INVALID CD (EXP: ${iso.expectedCheckDigit})` : 'INVALID ISO'}</span>`;
      }

      const isM2 = c.method === 'METHOD_2';
      const vgmNum = Number(c.vgmWeightKgm) || 0;
      const mgwNum = Number(c.maxGrossWeightKgm) || 30480;
      const pct = mgwNum > 0 ? Math.min(100, Math.round((vgmNum / mgwNum) * 100)) : 0;
      const isOver = vgmNum > mgwNum;
      const barCls = isOver ? 'over' : (pct >= 90 ? 'warn' : '');

      return `
        <tr data-vgm-row="${idx}">
          <td class="mono">${idx + 1}</td>
          <td style="min-width:165px;">
            <input type="text" class="mono vgm-c-no ${iso && !iso.valid ? 'input-error' : ''}" value="${escapeHtml(c.containerNo)}" placeholder="CSQU3054383" maxlength="11">
            <div class="vgm-iso-status">${isoPill}</div>
          </td>
          <td style="min-width:110px;">
            <select class="vgm-c-size">${sizeOptions}</select>
          </td>
          <td style="min-width:120px;">
            <select class="vgm-c-method">
              <option value="METHOD_2">Method 2 (Calc)</option>
              <option value="METHOD_1">Method 1 (Scale)</option>
            </select>
          </td>
          <td style="min-width:100px;">
            <input type="number" step="0.01" class="mono vgm-c-cargo" value="${escapeHtml(c.cargoWeightKgm)}" ${isM2 ? '' : 'disabled'} placeholder="${isM2 ? '18500' : 'N/A'}">
          </td>
          <td style="min-width:90px;">
            <input type="number" step="0.01" class="mono vgm-c-dunnage" value="${escapeHtml(c.dunnageWeightKgm)}" ${isM2 ? '' : 'disabled'} placeholder="0">
          </td>
          <td style="min-width:95px;">
            <input type="number" step="0.01" class="mono vgm-c-tare" value="${escapeHtml(c.tareWeightKgm)}">
          </td>
          <td style="min-width:95px;">
            <input type="number" step="0.01" class="mono vgm-c-mgw" value="${escapeHtml(c.maxGrossWeightKgm)}">
          </td>
          <td style="min-width:110px;">
            <input type="number" step="0.01" class="mono vgm-c-total ${isOver ? 'input-error' : ''}" value="${escapeHtml(c.vgmWeightKgm)}" ${isM2 ? 'readonly style="background:#f8fafc;font-weight:700;"' : ''}>
          </td>
          <td style="min-width:130px;">
            <div class="vgm-payload-info">
              <div class="mono" style="font-size:11px; font-weight:700; color:${isOver ? '#b91c1c' : '#334155'};">
                ${isOver ? `OVERWEIGHT +${MV.round2(vgmNum - mgwNum)} KGS` : `${pct}% of ${mgwNum} KGS`}
              </div>
              <div class="payload-bar-track">
                <div class="payload-bar-fill ${barCls}" style="width:${pct}%;"></div>
              </div>
            </div>
          </td>
          <td>
            <button type="button" class="btn btn-sm btn-danger-outline vgm-c-remove" ${state.vgmContainers.length === 1 ? 'disabled' : ''}>Remove</button>
          </td>
        </tr>
      `;
    }).join('');

    state.vgmContainers.forEach((c, idx) => {
      const tr = tbody.querySelector(`tr[data-vgm-row="${idx}"]`);
      if (!tr) return;
      tr.querySelector('.vgm-c-size').value = c.sizeType || '40HC';
      tr.querySelector('.vgm-c-method').value = c.method || 'METHOD_2';
    });

    updateVgmTotals();
  }

  function updateVgmTotals() {
    let totalTare = 0;
    let totalVgm = 0;
    state.vgmContainers.forEach((c) => {
      totalTare += Number(c.tareWeightKgm) || 0;
      totalVgm += Number(c.vgmWeightKgm) || 0;
    });
    $('vgm-total-cntrs').textContent = String(state.vgmContainers.length);
    $('vgm-total-tare').textContent = MV.round2(totalTare).toFixed(2);
    $('vgm-total-mass').textContent = MV.round2(totalVgm).toFixed(2);
  }

  function collectVgmPayload() {
    return {
      bookingNo: MV.normalizeBookingNo($('vgm-booking-no').value),
      carrierLine: $('vgm-carrier').value,
      vesselName: $('vgm-vessel').value,
      voyageNo: $('vgm-voyage').value,
      authorizedPerson: $('vgm-auth-person').value,
      declarantCompany: $('vgm-company').value,
      weighbridgeRef: $('vgm-weighbridge-ref').value,
      weighingDateTime: $('vgm-timestamp').value,
      solasDeclarationAccepted: $('vgm-solas-checkbox').checked,
      amendmentReason: $('vgm-amendment-reason').value,
      containers: state.vgmContainers.map((c) => ({
        containerNo: MV.normalizeUpper(c.containerNo),
        sizeType: c.sizeType,
        method: c.method,
        cargoWeightKgm: c.method === 'METHOD_2' ? Number(c.cargoWeightKgm || 0) : 0,
        dunnageWeightKgm: c.method === 'METHOD_2' ? Number(c.dunnageWeightKgm || 0) : 0,
        tareWeightKgm: Number(c.tareWeightKgm || 0),
        maxGrossWeightKgm: Number(c.maxGrossWeightKgm || 0),
        vgmWeightKgm: Number(c.vgmWeightKgm || 0)
      }))
    };
  }

  // ---------- Cross-Sync Banners ----------
  function updateCrossSyncBanners() {
    const s = state.currentShipment;
    const siBanner = $('si-sync-banner');
    const vgmBanner = $('vgm-sync-banner');

    if (s && s.vgmStatus === 'SUBMITTED' && s.vgmData) {
      const cnt = (s.vgmData.containers || []).length;
      const tot = MV.round2((s.vgmData.containers || []).reduce((a, c) => a + (Number(c.vgmWeightKgm) || 0), 0));
      $('si-sync-banner-text').textContent = `SOLAS VGM v${s.vgmVersion} (${cnt} container(s), Total VGM ${tot} KGS) is declared for Booking ${s.bookingNo}. SI Cargo Gross Weight must reconcile cleanly.`;
      siBanner.classList.remove('hidden');
    } else {
      siBanner.classList.add('hidden');
    }

    if (s && s.siData) {
      const cnt = (s.siData.containers || []).length;
      const tot = MV.round2((s.siData.containers || []).reduce((a, c) => a + (Number(c.cargoGrossWeightKgm) || 0), 0));
      $('vgm-sync-banner-text').textContent = `e-SI (${s.siStatus}) exists for Booking ${s.bookingNo} (${cnt} container(s), Cargo Gross Weight ${tot} KGS).`;
      vgmBanner.classList.remove('hidden');
    } else {
      vgmBanner.classList.add('hidden');
    }
  }

  // ---------- Error Display ----------
  function clearErrors(prefix) {
    $(`${prefix}-error-box`).classList.add('hidden');
    $(`${prefix}-error-list`).innerHTML = '';
  }

  function renderErrors(prefix, errors) {
    const box = $(`${prefix}-error-box`);
    const list = $(`${prefix}-error-list`);
    if (!errors || errors.length === 0) {
      clearErrors(prefix);
      return;
    }
    list.innerHTML = errors.map((e) => `
      <li>
        <span class="error-code">${escapeHtml(e.code)}</span>
        <strong>${escapeHtml(e.message)}</strong>
        ${e.remediation ? `<span class="error-remedy">Remediation: ${escapeHtml(e.remediation)}</span>` : ''}
      </li>
    `).join('');
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- Document Center & A4 Rendering ----------
  function switchDocView(view) {
    state.activeDocView = view;
    ['bl', 'vgm', 'audit'].forEach((v) => {
      const btn = $(`btn-view-${v}`);
      if (btn) btn.classList.toggle('btn-navy', v === view);
    });
    renderDocumentCenter();
  }

  function renderDocumentCenter() {
    clearErrors('docs');
    const s = state.currentShipment;
    const emptyEl = $('docs-empty-state');
    const blEl = $('doc-view-bl');
    const vgmEl = $('doc-view-vgm');
    const auditEl = $('doc-view-audit');

    $('docs-booking-label').textContent = s ? `${s.bookingNo} (${s.blNo || 'NO B/L'})` : 'NO BOOKING SELECTED';
    blEl.classList.add('hidden');
    vgmEl.classList.add('hidden');
    auditEl.classList.add('hidden');

    if (!s) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    if (state.activeDocView === 'bl') {
      renderBillOfLadingView(s, blEl);
      blEl.classList.remove('hidden');
    } else if (state.activeDocView === 'vgm') {
      renderVgmCertificateView(s, vgmEl);
      vgmEl.classList.remove('hidden');
    } else {
      renderAuditView(s);
      auditEl.classList.remove('hidden');
    }
  }

  function renderBillOfLadingView(s, containerEl) {
    if (!s.siData) {
      containerEl.innerHTML = `<div class="panel"><div class="panel-body muted" style="text-align:center; padding:32px;">Shipping Instruction (e-SI) has not been saved or submitted for Booking <strong>${escapeHtml(s.bookingNo)}</strong> yet.</div></div>`;
      return;
    }

    const si = s.siData;
    const carrier = MV.CARRIER_PROFILES[si.carrierLine] || MV.CARRIER_PROFILES.ONE;
    const isFinal = s.blStatus === 'FINAL_CONFIRMED';
    const docHeading = si.blType === 'SEAWAYBILL'
      ? 'SEA WAYBILL (NON-NEGOTIABLE)'
      : (si.blType === 'SURRENDERED' ? 'BILL OF LADING (TELEX RELEASE / SURRENDERED)' : 'BILL OF LADING FOR COMBINED TRANSPORT OR PORT TO PORT SHIPMENT');

    const watermarkText = isFinal
      ? (si.blType === 'SURRENDERED' ? 'FINAL — SURRENDERED' : 'FINAL CONFIRMED')
      : (s.siStatus === 'DRAFT' ? 'WORKING DRAFT — NOT SUBMITTED' : 'DRAFT B/L — FOR VERIFICATION ONLY');

    const vgmMap = new Map(((s.vgmData && s.vgmData.containers) || []).map((vc) => [vc.containerNo, vc]));
    const contList = si.containers || [];
    const totalPkgs = contList.reduce((a, c) => a + (Number(c.packageCount) || 0), 0);
    const totalCargoWt = MV.round2(contList.reduce((a, c) => a + (Number(c.cargoGrossWeightKgm) || 0), 0));
    const totalCbm = MV.round2(contList.reduce((a, c) => a + (Number(c.measurementCbm) || 0), 0));

    const contRowsHtml = contList.map((c) => {
      const vc = vgmMap.get(c.containerNo);
      return `
        <tr>
          <td class="mono">
            <strong>${escapeHtml(c.containerNo)}</strong><br>
            SEAL: ${escapeHtml(c.sealNo)}<br>
            TYPE: ${escapeHtml(c.sizeType)}
          </td>
          <td class="mono">${escapeHtml(c.packageCount)} ${escapeHtml(c.packageType)}</td>
          <td class="mono">${Number(c.cargoGrossWeightKgm || 0).toFixed(2)} KGS</td>
          <td class="mono">${Number(c.measurementCbm || 0).toFixed(2)} CBM</td>
          <td class="mono">${vc ? `${Number(vc.vgmWeightKgm).toFixed(2)} KGS<br>(${escapeHtml(vc.method)})` : '<span style="color:#b91c1c;">PENDING VGM</span>'}</td>
        </tr>
      `;
    }).join('');

    containerEl.innerHTML = `
      <div class="a4-sheet">
        <div class="watermark ${isFinal ? 'final' : ''}">${escapeHtml(watermarkText)}</div>
        <table class="bl-grid">
          <tr>
            <td colspan="2" style="width:55%; border-bottom:none;">
              <div class="bl-cell-label">Shipper</div>
              <pre class="bl-pre">${escapeHtml(si.shipper)}</pre>
            </td>
            <td colspan="2" style="width:45%;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div style="font-size:14px; font-weight:800; color:${carrier.accentColor};">${escapeHtml(carrier.name)}</div>
                  <div style="font-size:9px; font-weight:700;">${escapeHtml(docHeading)}</div>
                </div>
                <div class="mono" style="font-weight:800; font-size:12px; border:1px solid #000; padding:2px 6px;">${escapeHtml(carrier.scac)}</div>
              </div>
              <div style="margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:6px; border-top:1px solid #1e293b; padding-top:5px;">
                <div>
                  <div class="bl-cell-label">Booking No.</div>
                  <div class="mono" style="font-weight:700;">${escapeHtml(s.bookingNo)}</div>
                </div>
                <div>
                  <div class="bl-cell-label">B/L No.</div>
                  <div class="mono" style="font-weight:700;">${escapeHtml(s.blNo)} (v${s.siVersion})</div>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="border-top:1px solid #1e293b;">
              <div class="bl-cell-label">Consignee</div>
              <pre class="bl-pre">${escapeHtml(si.consignee)}</pre>
            </td>
            <td colspan="2" rowspan="2">
              <div class="bl-cell-label">Carrier Head Office &amp; Terms</div>
              <div style="font-size:9px;">${escapeHtml(carrier.headquarters)}</div>
              <div style="font-size:8.5px; margin-top:6px; color:#334155;">${escapeHtml(carrier.standardClause)}</div>
              <div style="margin-top:10px; border-top:1px solid #cbd5e1; padding-top:5px;">
                <div class="bl-cell-label">Freight Terms &amp; Originals</div>
                <div class="mono">FREIGHT ${escapeHtml(si.freightTerms)} | ORIGINALS: ${escapeHtml(si.noOfOriginals)}/${escapeHtml(si.noOfOriginals)}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td colspan="2">
              <div class="bl-cell-label">Notify Party</div>
              <pre class="bl-pre">${escapeHtml(si.notifyParty)}</pre>
            </td>
          </tr>
          <tr>
            <td style="width:28%;">
              <div class="bl-cell-label">Ocean Vessel &amp; Voyage No.</div>
              <div class="mono">${escapeHtml(si.vesselName)} / ${escapeHtml(si.voyageNo)}</div>
            </td>
            <td style="width:27%;">
              <div class="bl-cell-label">Place of Receipt</div>
              <div class="mono">${escapeHtml(si.placeOfReceipt)}</div>
            </td>
            <td style="width:23%;">
              <div class="bl-cell-label">Port of Loading</div>
              <div class="mono">${escapeHtml(si.portOfLoading)}</div>
            </td>
            <td style="width:22%;">
              <div class="bl-cell-label">Port of Discharge</div>
              <div class="mono">${escapeHtml(si.portOfDischarge)}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div class="bl-cell-label">Place of Delivery</div>
              <div class="mono">${escapeHtml(si.placeOfDelivery)}</div>
            </td>
            <td>
              <div class="bl-cell-label">Place of B/L Issue</div>
              <div class="mono">${escapeHtml(si.placeOfIssue)}</div>
            </td>
            <td>
              <div class="bl-cell-label">Primary HS Code</div>
              <div class="mono">${escapeHtml(si.hsCode)}</div>
            </td>
            <td>
              <div class="bl-cell-label">VGM Compliance Status</div>
              <div class="mono" style="font-weight:700;">${escapeHtml(s.vgmStatus)}${s.vgmVersion ? ` (v${s.vgmVersion})` : ''}</div>
            </td>
          </tr>
        </table>

        <table class="bl-grid" style="margin-top:-1px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="width:24%;">Marks &amp; Numbers</th>
              <th style="width:14%;">No. of Pkgs</th>
              <th style="width:36%;">Description of Packages and Goods</th>
              <th style="width:13%;">Cargo Gross Wt</th>
              <th style="width:13%;">Measurement</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><pre class="bl-pre">${escapeHtml(si.marksAndNumbers)}</pre></td>
              <td class="mono">${totalPkgs} PKGS</td>
              <td>
                <pre class="bl-pre">${escapeHtml(si.goodsDescription)}</pre>
                <div class="mono" style="margin-top:8px; font-weight:700;">${escapeHtml(MV.formatContainerSummaryWords(contList))}</div>
                ${si.specialClauses ? `<div class="mono" style="margin-top:6px;">REMARKS: ${escapeHtml(si.specialClauses)}</div>` : ''}
              </td>
              <td class="mono">${totalCargoWt.toFixed(2)} KGS</td>
              <td class="mono">${totalCbm.toFixed(2)} CBM</td>
            </tr>
          </tbody>
        </table>

        <table class="bl-grid" style="margin-top:-1px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th>Container / Seal / Equipment</th>
              <th>Packages</th>
              <th>Cargo Gross Weight</th>
              <th>Measurement</th>
              <th>SOLAS VGM Declared</th>
            </tr>
          </thead>
          <tbody>
            ${contRowsHtml}
          </tbody>
        </table>

        <table class="bl-grid" style="margin-top:-1px;">
          <tr>
            <td style="width:55%;">
              <div class="bl-cell-label">Freight &amp; Charges</div>
              <div class="mono" style="font-weight:700;">FREIGHT ${escapeHtml(si.freightTerms)}</div>
            </td>
            <td style="width:45%;">
              <div class="bl-cell-label">Signed For The Carrier (${escapeHtml(carrier.scac)})</div>
              <div style="height:36px;"></div>
              <div class="mono" style="font-size:9px; border-top:1px solid #94a3b8; padding-top:3px;">
                Status: ${escapeHtml(s.blStatus)} | Timestamp: ${escapeHtml(s.updatedAt)}
              </div>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  function renderVgmCertificateView(s, containerEl) {
    if (!s.vgmData) {
      containerEl.innerHTML = `<div class="panel"><div class="panel-body muted" style="text-align:center; padding:32px;">SOLAS VGM Declaration has not been submitted for Booking <strong>${escapeHtml(s.bookingNo)}</strong> yet.</div></div>`;
      return;
    }

    const vgm = s.vgmData;
    const carrier = MV.CARRIER_PROFILES[vgm.carrierLine] || MV.CARRIER_PROFILES.ONE;
    const rows = (vgm.containers || []).map((c, i) => `
      <tr>
        <td class="mono">${i + 1}</td>
        <td class="mono"><strong>${escapeHtml(c.containerNo)}</strong></td>
        <td class="mono">${escapeHtml(c.sizeType)}</td>
        <td class="mono">${escapeHtml(c.method)}</td>
        <td class="mono">${c.method === 'METHOD_2' ? Number(c.cargoWeightKgm).toFixed(2) : 'N/A'}</td>
        <td class="mono">${c.method === 'METHOD_2' ? Number(c.dunnageWeightKgm).toFixed(2) : 'N/A'}</td>
        <td class="mono">${Number(c.tareWeightKgm).toFixed(2)}</td>
        <td class="mono">${Number(c.maxGrossWeightKgm).toFixed(2)}</td>
        <td class="mono"><strong>${Number(c.vgmWeightKgm).toFixed(2)} KGS</strong></td>
      </tr>
    `).join('');

    const totalVgm = MV.round2((vgm.containers || []).reduce((a, c) => a + (Number(c.vgmWeightKgm) || 0), 0));

    containerEl.innerHTML = `
      <div class="a4-sheet">
        <div class="watermark final">SOLAS VGM VERIFIED</div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:12px;">
          <div>
            <div style="font-size:16px; font-weight:800; color:${carrier.accentColor};">${escapeHtml(carrier.name)}</div>
            <div style="font-size:13px; font-weight:700;">SOLAS VERIFIED GROSS MASS (VGM) CONFIRMATION CERTIFICATE</div>
          </div>
          <div class="mono" style="text-align:right;">
            <div><strong>BOOKING:</strong> ${escapeHtml(s.bookingNo)}</div>
            <div><strong>VERSION:</strong> v${s.vgmVersion}</div>
          </div>
        </div>

        <table class="bl-grid" style="margin-bottom:12px;">
          <tr>
            <td style="width:50%;">
              <div class="bl-cell-label">Shipper / Declarant Company</div>
              <div class="mono" style="font-weight:700;">${escapeHtml(vgm.declarantCompany)}</div>
            </td>
            <td style="width:50%;">
              <div class="bl-cell-label">Authorized Signatory (SOLAS Reg. 2)</div>
              <div class="mono" style="font-weight:700;">${escapeHtml(vgm.authorizedPerson)}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div class="bl-cell-label">Vessel / Voyage</div>
              <div class="mono">${escapeHtml(vgm.vesselName)} / ${escapeHtml(vgm.voyageNo)}</div>
            </td>
            <td>
              <div class="bl-cell-label">Weighbridge / Scale Ref &amp; Timestamp</div>
              <div class="mono">${escapeHtml(vgm.weighbridgeRef || 'N/A')} | ${escapeHtml(vgm.weighingDateTime)}</div>
            </td>
          </tr>
        </table>

        <table class="bl-grid">
          <thead>
            <tr style="background:#f1f5f9;">
              <th>#</th>
              <th>Container No.</th>
              <th>Type</th>
              <th>Method</th>
              <th>Cargo (KGS)</th>
              <th>Dunnage (KGS)</th>
              <th>Tare (KGS)</th>
              <th>CSC MGW (KGS)</th>
              <th>Verified VGM</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="background:#f8fafc; font-weight:700;">
              <td colspan="8" style="text-align:right;">TOTAL VERIFIED GROSS MASS (${(vgm.containers || []).length} CONTAINER(S)):</td>
              <td class="mono">${totalVgm.toFixed(2)} KGS</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top:16px; border:1px solid #1e293b; padding:10px; font-size:10px;">
          <strong>SOLAS Chapter VI, Regulation 2 Compliance Certification:</strong><br>
          The undersigned Shipper/Authorized Representative certifies that the Verified Gross Mass (VGM) stated above has been verified prior to vessel loading using certified weighing apparatus or approved Method 2 calculation, strictly complies with CSC structural payload limits, and is reconciled against the electronic Shipping Instruction.
        </div>
      </div>
    `;
  }

  function renderAuditView(s) {
    const tbody = $('audit-tbody');
    const logs = s.auditLogs || [];
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;">No audit events recorded.</td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map((l) => `
      <tr>
        <td class="mono">${escapeHtml(l.createdAt)}</td>
        <td><span class="badge badge-info">${escapeHtml(l.docType)}</span></td>
        <td class="mono">v${escapeHtml(l.version)}</td>
        <td class="mono">${escapeHtml(l.actor)}</td>
        <td>${escapeHtml(l.summary)}</td>
      </tr>
    `).join('');
  }

  // ---------- Tab 5: ISO 6346 & CSC Tare Inquiry ----------
  function initToolsTab() {
    const tbody = $('tool-specs-tbody');
    tbody.innerHTML = Object.values(MV.EQUIPMENT_SPECS).map((spec) => `
      <tr>
        <td class="mono"><strong>${escapeHtml(spec.code)}</strong></td>
        <td class="mono">${escapeHtml(spec.isoCode)}</td>
        <td>${escapeHtml(spec.label)}</td>
        <td class="mono">${spec.defaultTareKgm} KGS</td>
        <td class="mono">${spec.minTareKgm}–${spec.maxTareKgm} KGS</td>
        <td class="mono">${spec.maxGrossWeightKgm} KGS</td>
        <td class="mono">${spec.maxVolumeCbm} CBM</td>
      </tr>
    `).join('');
  }

  function runIsoToolCheck() {
    const raw = MV.normalizeUpper($('tool-iso-input').value).replace(/[\s-]/g, '');
    const out = $('tool-iso-result');
    if (raw.length === 10) {
      const calc = MV.calculateIso6346CheckDigit(raw);
      if (!calc.valid) {
        out.innerHTML = `<div class="alert-box alert-danger">${escapeHtml(calc.error)}</div>`;
        return;
      }
      out.innerHTML = renderIsoBreakdownHtml(calc, true);
      return;
    }

    const res = MV.validateContainerNumber(raw);
    if (!res.steps) {
      out.innerHTML = `<div class="alert-box alert-danger"><strong>INVALID FORMAT:</strong> ${escapeHtml(res.error)}<br><span class="error-remedy">${escapeHtml(res.remediation)}</span></div>`;
      return;
    }
    out.innerHTML = renderIsoBreakdownHtml(res, false);
  }

  function renderIsoBreakdownHtml(res, isPrefixCalc) {
    const headerBanner = isPrefixCalc
      ? `<div class="alert-box alert-info"><strong>Computed Check Digit:</strong> <span class="mono" style="font-size:15px;">${escapeHtml(res.fullContainerNo)}</span> (Check Digit = <strong>${res.checkDigit}</strong>)</div>`
      : (res.valid
        ? `<div class="alert-box alert-success"><strong>VALID ISO 6346 CONTAINER NUMBER:</strong> <span class="mono">${escapeHtml(res.normalized)}</span> (Check Digit = <strong>${res.expectedCheckDigit}</strong>)</div>`
        : `<div class="alert-box alert-danger"><strong>INVALID CHECK DIGIT:</strong> ${escapeHtml(res.error)}</div>`);

    const rows = res.steps.map((st) => `
      <tr>
        <td class="mono">${st.position}</td>
        <td class="mono"><strong>${escapeHtml(st.char)}</strong></td>
        <td class="mono">${st.numericValue}</td>
        <td class="mono">2^${st.position - 1} = ${st.weight}</td>
        <td class="mono">${st.product}</td>
      </tr>
    `).join('');

    const cd = res.checkDigit !== undefined ? res.checkDigit : res.expectedCheckDigit;
    return `
      ${headerBanner}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Char</th>
              <th>ISO Numeric Value</th>
              <th>Weight</th>
              <th>Product</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="background:#f8fafc; font-weight:700;">
              <td colspan="4" style="text-align:right;">Total Weighted Sum = ${res.sum} &rarr; Remainder (Mod 11) = ${res.remainder} &rarr; Check Digit =</td>
              <td class="mono">${cd}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ---------- Bulk Paste Modal ----------
  function openBulkModal(target) {
    state.bulkTarget = target;
    $('bulk-modal-title').textContent = target === 'si'
      ? 'Bulk Paste Containers into e-SI'
      : 'Bulk Paste Containers into SOLAS VGM';
    $('bulk-modal-hint').textContent = target === 'si'
      ? 'One container per line (comma or tab separated): ContainerNo, SealNo, SizeType, Packages, PkgType, CargoGrossKg, CBM (e.g. CSQU3054383, SL991022, 40HC, 850, CARTONS, 20500, 58.5)'
      : 'One container per line (comma or tab separated): ContainerNo, SizeType, Method (METHOD_1 or METHOD_2), WeightKg (VGM for M1 or CargoKg for M2), TareKg (optional), DunnageKg (optional)';
    $('bulk-modal-textarea').value = '';
    $('bulk-modal').classList.remove('hidden');
  }

  function applyBulkImport() {
    const raw = $('bulk-modal-textarea').value.trim();
    if (!raw) {
      $('bulk-modal').classList.add('hidden');
      return;
    }
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (state.bulkTarget === 'si') {
      const parsed = lines.map((line) => {
        const cols = line.split(/[,\t]+/).map((s) => s.trim());
        return {
          containerNo: MV.normalizeUpper(cols[0] || ''),
          sealNo: MV.normalizeUpper(cols[1] || ''),
          sizeType: MV.EQUIPMENT_SPECS[MV.normalizeUpper(cols[2])] ? MV.normalizeUpper(cols[2]) : '40HC',
          packageCount: cols[3] || '',
          packageType: MV.PACKAGE_TYPES.includes(MV.normalizeUpper(cols[4])) ? MV.normalizeUpper(cols[4]) : 'CARTONS',
          cargoGrossWeightKgm: cols[5] || '',
          measurementCbm: cols[6] || ''
        };
      });
      const existingNonEmpty = state.siContainers.filter((c) => c.containerNo || c.sealNo || c.cargoGrossWeightKgm);
      state.siContainers = existingNonEmpty.concat(parsed);
      renderSiContainers();
    } else {
      const parsed = lines.map((line) => {
        const cols = line.split(/[,\t]+/).map((s) => s.trim());
        const sizeType = MV.EQUIPMENT_SPECS[MV.normalizeUpper(cols[1])] ? MV.normalizeUpper(cols[1]) : '40HC';
        const spec = MV.EQUIPMENT_SPECS[sizeType];
        const method = MV.normalizeUpper(cols[2]) === 'METHOD_1' ? 'METHOD_1' : 'METHOD_2';
        const w = Number(cols[3]) || 0;
        const tare = cols[4] ? Number(cols[4]) : spec.defaultTareKgm;
        const dunnage = cols[5] ? Number(cols[5]) : 0;
        return {
          containerNo: MV.normalizeUpper(cols[0] || ''),
          sizeType,
          method,
          cargoWeightKgm: method === 'METHOD_2' ? String(w) : '',
          dunnageWeightKgm: method === 'METHOD_2' ? String(dunnage) : '0',
          tareWeightKgm: String(tare),
          maxGrossWeightKgm: String(spec.maxGrossWeightKgm),
          vgmWeightKgm: method === 'METHOD_2' ? String(MV.round2(w + dunnage + tare)) : String(w)
        };
      });
      const existingNonEmpty = state.vgmContainers.filter((c) => c.containerNo);
      state.vgmContainers = existingNonEmpty.concat(parsed);
      renderVgmContainers();
    }
    $('bulk-modal').classList.add('hidden');
    showToast(`Imported ${lines.length} container row(s).`);
  }

  // ---------- Event Wiring ----------
  function wireEvents() {
    // Carrier switcher
    $('global-carrier-select').addEventListener('change', (e) => {
      applyCarrierProfile(e.target.value);
    });
    $('si-carrier').addEventListener('change', (e) => applyCarrierProfile(e.target.value));
    $('vgm-carrier').addEventListener('change', (e) => applyCarrierProfile(e.target.value));

    // Tabs
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Booking synchronizer bar
    $('btn-sync-booking').addEventListener('click', () => loadAndSyncBooking($('active-booking-input').value));
    $('active-booking-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadAndSyncBooking($('active-booking-input').value);
      }
    });
    $('btn-new-booking').addEventListener('click', () => {
      startNewBlankBooking();
      showToast('Started new blank booking form.');
    });

    // Auto-sync booking input across forms if user types directly on form
    ['si-booking-no', 'vgm-booking-no'].forEach((id) => {
      $(id).addEventListener('change', async (e) => {
        const val = MV.normalizeBookingNo(e.target.value);
        e.target.value = val;
        if (val && val !== state.activeBookingNo) {
          state.activeBookingNo = val;
          $('active-booking-input').value = val;
          $('si-booking-no').value = val;
          $('vgm-booking-no').value = val;
          const { ok, data } = await apiFetch(`/api/shipments/${encodeURIComponent(val)}`);
          if (ok && data.shipment) {
            state.currentShipment = data.shipment;
            showToast(`Loaded existing Booking ${val} data for cross-checking.`);
            if (id === 'si-booking-no' && data.shipment.siData) populateSiFromShipment(data.shipment);
            if (id === 'vgm-booking-no' && data.shipment.vgmData) populateVgmFromShipment(data.shipment);
          } else {
            state.currentShipment = null;
          }
          updateSyncStatusStrip();
          updateCrossSyncBanners();
        }
      });
    });

    // Dashboard controls
    $('dashboard-search').addEventListener('input', renderDashboard);
    $('btn-dash-refresh').addEventListener('click', loadDashboard);
    $('btn-dash-new-si').addEventListener('click', () => startNewBlankBooking('si'));
    $('btn-dash-new-vgm').addEventListener('click', () => startNewBlankBooking('vgm'));
    $('dashboard-tbody').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const bkg = btn.dataset.bkg;
      const action = btn.dataset.action;
      if (action === 'open-si') await loadAndSyncBooking(bkg, 'si');
      else if (action === 'open-vgm') await loadAndSyncBooking(bkg, 'vgm');
      else if (action === 'open-docs') await loadAndSyncBooking(bkg, 'docs');
      else if (action === 'del-bkg') {
        if (!window.confirm(`Delete booking ${bkg} and all its audit history from SQLite?`)) return;
        const res = await apiFetch(`/api/shipments/${encodeURIComponent(bkg)}`, { method: 'DELETE' });
        if (res.ok) {
          if (state.activeBookingNo === bkg) startNewBlankBooking();
          loadDashboard();
          showToast(`Deleted booking ${bkg}.`);
        }
      }
    });

    // e-SI B/L Type -> Originals linkage
    $('si-bl-type').addEventListener('change', (e) => {
      if (e.target.value === 'SEAWAYBILL') $('si-no-originals').value = '0';
      else if ($('si-no-originals').value === '0') $('si-no-originals').value = '3';
    });

    // Same as Consignee
    $('btn-same-as-consignee').addEventListener('click', () => {
      $('si-notify').value = $('si-consignee').value;
      refreshAllEdiMeters();
    });

    // EDI live meters
    ['si-shipper', 'si-consignee', 'si-notify', 'si-marks', 'si-goods-desc'].forEach((id) => {
      $(id).addEventListener('input', refreshAllEdiMeters);
    });

    // Clause chips
    document.querySelectorAll('.chip-btn[data-clause]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const box = $('si-goods-desc');
        const clause = btn.dataset.clause;
        box.value = box.value.trim() ? `${box.value.trim()}\n${clause}` : clause;
        refreshAllEdiMeters();
      });
    });

    $('btn-insert-say-total').addEventListener('click', () => {
      const box = $('si-goods-desc');
      const sentence = MV.formatContainerSummaryWords(state.siContainers);
      box.value = box.value.trim() ? `${box.value.trim()}\n${sentence}` : sentence;
      refreshAllEdiMeters();
    });

    // e-SI Container table events
    $('btn-si-add-container').addEventListener('click', () => {
      state.siContainers.push(createEmptySiContainer());
      renderSiContainers();
    });
    $('btn-si-bulk-modal').addEventListener('click', () => openBulkModal('si'));

    $('si-containers-tbody').addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-si-row]');
      if (!tr) return;
      const idx = Number(tr.dataset.siRow);
      const row = state.siContainers[idx];
      if (!row) return;

      if (e.target.classList.contains('si-c-no')) {
        row.containerNo = MV.normalizeUpper(e.target.value);
        e.target.value = row.containerNo;
        const iso = row.containerNo ? MV.validateContainerNumber(row.containerNo) : null;
        e.target.classList.toggle('input-error', Boolean(iso && !iso.valid));
        const statusEl = tr.querySelector('.si-iso-status');
        if (!iso) statusEl.innerHTML = '<span class="row-valid-pill" style="background:#f1f5f9;color:#64748b;">11-CHAR ISO 6346</span>';
        else if (iso.valid) statusEl.innerHTML = `<span class="row-valid-pill ok">ISO OK (CD: ${iso.expectedCheckDigit})</span>`;
        else statusEl.innerHTML = `<span class="row-valid-pill err">${iso.expectedCheckDigit !== undefined ? `INVALID CD (EXP: ${iso.expectedCheckDigit})` : 'INVALID ISO'}</span>`;
      } else if (e.target.classList.contains('si-c-seal')) {
        row.sealNo = MV.normalizeUpper(e.target.value);
      } else if (e.target.classList.contains('si-c-pkgs')) {
        row.packageCount = e.target.value;
        updateSiTotals();
      } else if (e.target.classList.contains('si-c-weight')) {
        row.cargoGrossWeightKgm = e.target.value;
        updateSiTotals();
      } else if (e.target.classList.contains('si-c-cbm')) {
        row.measurementCbm = e.target.value;
        updateSiTotals();
      }
    });

    $('si-containers-tbody').addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-si-row]');
      if (!tr) return;
      const idx = Number(tr.dataset.siRow);
      const row = state.siContainers[idx];
      if (!row) return;
      if (e.target.classList.contains('si-c-size')) row.sizeType = e.target.value;
      if (e.target.classList.contains('si-c-pkgtype')) row.packageType = e.target.value;
    });

    $('si-containers-tbody').addEventListener('click', (e) => {
      if (!e.target.classList.contains('si-c-remove')) return;
      const tr = e.target.closest('tr[data-si-row]');
      const idx = Number(tr.dataset.siRow);
      if (state.siContainers.length > 1) {
        state.siContainers.splice(idx, 1);
        renderSiContainers();
      }
    });

    // Pull VGM into SI
    $('btn-si-pull-vgm').addEventListener('click', () => {
      const vgm = state.currentShipment && state.currentShipment.vgmData;
      if (!vgm) return;
      if (!$('si-vessel').value) $('si-vessel').value = vgm.vesselName || '';
      if (!$('si-voyage').value) $('si-voyage').value = vgm.voyageNo || '';
      state.siContainers = (vgm.containers || []).map((vc, i) => {
        const prev = state.siContainers[i] || {};
        const cargoGross = vc.method === 'METHOD_2'
          ? MV.round2((vc.cargoWeightKgm || 0) + (vc.dunnageWeightKgm || 0))
          : MV.round2((vc.vgmWeightKgm || 0) - (vc.tareWeightKgm || 0));
        return {
          containerNo: vc.containerNo,
          sealNo: prev.sealNo || '',
          sizeType: vc.sizeType,
          packageCount: prev.packageCount || '',
          packageType: prev.packageType || 'CARTONS',
          cargoGrossWeightKgm: cargoGross > 0 ? String(cargoGross) : '',
          measurementCbm: prev.measurementCbm || ''
        };
      });
      renderSiContainers();
      showToast('Synchronized container numbers and net cargo weights from SOLAS VGM.');
    });

    // Save Draft / Submit SI
    $('btn-si-save-draft').addEventListener('click', async () => {
      clearErrors('si');
      const payload = collectSiPayload();
      const bkg = payload.bookingNo || 'INVALID';
      const { ok, data } = await apiFetch(`/api/shipments/${encodeURIComponent(bkg)}/si/draft`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!ok) {
        renderErrors('si', data.errors);
        return;
      }
      state.activeBookingNo = data.shipment.bookingNo;
      state.currentShipment = data.shipment;
      $('active-booking-input').value = state.activeBookingNo;
      updateSyncStatusStrip();
      updateCrossSyncBanners();
      showToast(`Saved e-SI Draft for ${state.activeBookingNo}.`);
    });

    $('si-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors('si');
      const payload = collectSiPayload();
      const bkg = payload.bookingNo || 'INVALID';
      const { ok, data } = await apiFetch(`/api/shipments/${encodeURIComponent(bkg)}/si/submit`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!ok) {
        renderErrors('si', data.errors);
        return;
      }
      state.activeBookingNo = data.shipment.bookingNo;
      state.currentShipment = data.shipment;
      $('active-booking-input').value = state.activeBookingNo;
      populateSiFromShipment(data.shipment);
      updateSyncStatusStrip();
      updateCrossSyncBanners();
      showToast(`e-SI v${data.shipment.siVersion} submitted! Draft B/L generated.`);
    });

    // VGM Container table events
    $('btn-vgm-add-container').addEventListener('click', () => {
      state.vgmContainers.push(createEmptyVgmContainer());
      renderVgmContainers();
    });
    $('btn-vgm-bulk-modal').addEventListener('click', () => openBulkModal('vgm'));

    $('btn-vgm-pull-si').addEventListener('click', () => {
      const si = state.currentShipment && state.currentShipment.siData;
      if (!si) return;
      $('vgm-vessel').value = si.vesselName || '';
      $('vgm-voyage').value = si.voyageNo || '';
      state.vgmContainers = (si.containers || []).map((sc) => {
        const spec = MV.EQUIPMENT_SPECS[sc.sizeType] || MV.EQUIPMENT_SPECS['40HC'];
        const cargoWt = Number(sc.cargoGrossWeightKgm) || 0;
        return {
          containerNo: sc.containerNo,
          sizeType: sc.sizeType,
          method: 'METHOD_2',
          cargoWeightKgm: String(cargoWt),
          dunnageWeightKgm: '0',
          tareWeightKgm: String(spec.defaultTareKgm),
          maxGrossWeightKgm: String(spec.maxGrossWeightKgm),
          vgmWeightKgm: String(MV.round2(cargoWt + spec.defaultTareKgm))
        };
      });
      renderVgmContainers();
      showToast('Pulled containers and Cargo Gross Weights from e-SI.');
    });

    $('vgm-containers-tbody').addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-vgm-row]');
      if (!tr) return;
      const idx = Number(tr.dataset.vgmRow);
      const row = state.vgmContainers[idx];
      if (!row) return;

      if (e.target.classList.contains('vgm-c-no')) {
        row.containerNo = MV.normalizeUpper(e.target.value);
        e.target.value = row.containerNo;
        const iso = row.containerNo ? MV.validateContainerNumber(row.containerNo) : null;
        e.target.classList.toggle('input-error', Boolean(iso && !iso.valid));
        const statusEl = tr.querySelector('.vgm-iso-status');
        if (!iso) statusEl.innerHTML = '<span class="row-valid-pill" style="background:#f1f5f9;color:#64748b;">11-CHAR ISO 6346</span>';
        else if (iso.valid) statusEl.innerHTML = `<span class="row-valid-pill ok">ISO OK (CD: ${iso.expectedCheckDigit})</span>`;
        else statusEl.innerHTML = `<span class="row-valid-pill err">${iso.expectedCheckDigit !== undefined ? `INVALID CD (EXP: ${iso.expectedCheckDigit})` : 'INVALID ISO'}</span>`;
        return;
      }

      if (e.target.classList.contains('vgm-c-cargo')) row.cargoWeightKgm = e.target.value;
      else if (e.target.classList.contains('vgm-c-dunnage')) row.dunnageWeightKgm = e.target.value;
      else if (e.target.classList.contains('vgm-c-tare')) row.tareWeightKgm = e.target.value;
      else if (e.target.classList.contains('vgm-c-mgw')) row.maxGrossWeightKgm = e.target.value;
      else if (e.target.classList.contains('vgm-c-total')) row.vgmWeightKgm = e.target.value;

      if (row.method === 'METHOD_2') {
        const calcVgm = MV.round2(
          (Number(row.cargoWeightKgm) || 0) +
          (Number(row.dunnageWeightKgm) || 0) +
          (Number(row.tareWeightKgm) || 0)
        );
        row.vgmWeightKgm = String(calcVgm);
        tr.querySelector('.vgm-c-total').value = row.vgmWeightKgm;
      }

      const vgmNum = Number(row.vgmWeightKgm) || 0;
      const mgwNum = Number(row.maxGrossWeightKgm) || 30480;
      const pct = mgwNum > 0 ? Math.min(100, Math.round((vgmNum / mgwNum) * 100)) : 0;
      const isOver = vgmNum > mgwNum;
      tr.querySelector('.vgm-c-total').classList.toggle('input-error', isOver);
      tr.querySelector('.vgm-payload-info').innerHTML = `
        <div class="mono" style="font-size:11px; font-weight:700; color:${isOver ? '#b91c1c' : '#334155'};">
          ${isOver ? `OVERWEIGHT +${MV.round2(vgmNum - mgwNum)} KGS` : `${pct}% of ${mgwNum} KGS`}
        </div>
        <div class="payload-bar-track">
          <div class="payload-bar-fill ${isOver ? 'over' : (pct >= 90 ? 'warn' : '')}" style="width:${pct}%;"></div>
        </div>
      `;
      updateVgmTotals();
    });

    $('vgm-containers-tbody').addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-vgm-row]');
      if (!tr) return;
      const idx = Number(tr.dataset.vgmRow);
      const row = state.vgmContainers[idx];
      if (!row) return;
      if (e.target.classList.contains('vgm-c-size')) {
        row.sizeType = e.target.value;
        const spec = MV.EQUIPMENT_SPECS[row.sizeType];
        if (spec) {
          row.tareWeightKgm = String(spec.defaultTareKgm);
          row.maxGrossWeightKgm = String(spec.maxGrossWeightKgm);
          if (row.method === 'METHOD_2') {
            row.vgmWeightKgm = String(MV.round2((Number(row.cargoWeightKgm) || 0) + (Number(row.dunnageWeightKgm) || 0) + spec.defaultTareKgm));
          }
        }
        renderVgmContainers();
      } else if (e.target.classList.contains('vgm-c-method')) {
        row.method = e.target.value;
        if (row.method === 'METHOD_2') {
          row.vgmWeightKgm = String(MV.round2((Number(row.cargoWeightKgm) || 0) + (Number(row.dunnageWeightKgm) || 0) + (Number(row.tareWeightKgm) || 0)));
        }
        renderVgmContainers();
      }
    });

    $('vgm-containers-tbody').addEventListener('click', (e) => {
      if (!e.target.classList.contains('vgm-c-remove')) return;
      const tr = e.target.closest('tr[data-vgm-row]');
      const idx = Number(tr.dataset.vgmRow);
      if (state.vgmContainers.length > 1) {
        state.vgmContainers.splice(idx, 1);
        renderVgmContainers();
      }
    });

    // Submit SOLAS VGM
    $('vgm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors('vgm');
      const payload = collectVgmPayload();
      const bkg = payload.bookingNo || 'INVALID';
      const { ok, data } = await apiFetch(`/api/shipments/${encodeURIComponent(bkg)}/vgm/submit`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!ok) {
        renderErrors('vgm', data.errors);
        return;
      }
      state.activeBookingNo = data.shipment.bookingNo;
      state.currentShipment = data.shipment;
      $('active-booking-input').value = state.activeBookingNo;
      populateVgmFromShipment(data.shipment);
      updateSyncStatusStrip();
      updateCrossSyncBanners();
      showToast(`SOLAS VGM v${data.shipment.vgmVersion} confirmed!`);
    });

    // Document Center controls
    document.querySelectorAll('button[data-docview]').forEach((btn) => {
      btn.addEventListener('click', () => switchDocView(btn.dataset.docview));
    });

    $('btn-approve-final-bl').addEventListener('click', async () => {
      if (!state.activeBookingNo) {
        showToast('Load an active Booking No. first.');
        return;
      }
      clearErrors('docs');
      const actor = (state.currentShipment && state.currentShipment.vgmData && state.currentShipment.vgmData.authorizedPerson) || 'DOCUMENTATION_APPROVER';
      const { ok, data } = await apiFetch(`/api/shipments/${encodeURIComponent(state.activeBookingNo)}/bl/approve`, {
        method: 'POST',
        body: JSON.stringify({ actor })
      });
      if (!ok) {
        renderErrors('docs', data.errors);
        return;
      }
      state.currentShipment = data.shipment;
      updateSyncStatusStrip();
      renderDocumentCenter();
      showToast(`Final B/L ${data.shipment.blNo} confirmed!`);
    });

    $('btn-print-doc').addEventListener('click', () => {
      if (!state.currentShipment) {
        showToast('Select a Booking No. to print.');
        return;
      }
      if (state.activeDocView === 'audit') {
        switchDocView('bl');
      }
      window.print();
    });

    // Tools tab
    $('btn-tool-iso-check').addEventListener('click', runIsoToolCheck);
    $('tool-iso-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runIsoToolCheck();
      }
    });

    // Modal controls
    $('btn-bulk-close').addEventListener('click', () => $('bulk-modal').classList.add('hidden'));
    $('btn-bulk-cancel').addEventListener('click', () => $('bulk-modal').classList.add('hidden'));
    $('btn-bulk-apply').addEventListener('click', applyBulkImport);
  }

  // ---------- Bootstrap ----------
  function init() {
    applyCarrierProfile('ONE');
    resetSiFormKeepingBooking('');
    resetVgmFormKeepingBooking('');
    initToolsTab();
    wireEvents();
    updateSyncStatusStrip();
    loadDashboard();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
