'use strict';

/**
 * Bộ Mẫu Đơn Đề nghị Phát hành Thư tín dụng (Import L/C Application)
 * Sử dụng Logo chính thức (Base64 Data URI) và bố cục chuẩn 100% theo biểu mẫu PDF gốc của từng Ngân hàng:
 * - Vietcombank (VCB): Phụ lục số 16 - YÊU CẦU PHÁT HÀNH THƯ TÍN DỤNG (VCB_Phat_hanh_LC.pdf)
 * - VPBank (VPB): MB01.HDM-TM.N/A.N/A/01 - ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG (VPB_1.pdf)
 * - Techcombank (TCB): MB01-QT.TTTM/TCB - Theo Luật TCTD 32/2024/QH15 & Thông tư 21/2024/TT-NHNN (TCB_LC.pdf / TCB_1.pdf)
 * - Eximbank (EIB): BM01-QĐ18/CL&PTSP KHDN - ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG (EIB_1.pdf)
 * - BIDV, VietinBank (VTB), ACB, MB Bank (MB), Sacombank (STB), Ngân hàng khác (OTHER):
 *   Chuẩn mẫu song ngữ 2 cột đối xứng thực tế tại Việt Nam (MB.LCNK.01 / TTQT từng ngân hàng).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ucp600-engine.js'), require('./bank-logos.js'));
  } else {
    root.BankTemplates = factory(root.UCP600Engine, root.BankLogos || {});
  }
})(typeof self !== 'undefined' ? self : this, function (Engine, BankLogos) {

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function chk(cond) {
    return cond
      ? '<span style="font-family:\'Segoe UI Symbol\',\'DejaVu Sans\',sans-serif;font-weight:bold;">&#9745;</span>'
      : '<span style="font-family:\'Segoe UI Symbol\',\'DejaVu Sans\',sans-serif;">&#9744;</span>';
  }

  function fmtYyMmDdSlash(isoDate) {
    if (!isoDate) return '--/--/--';
    const m = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoDate;
    return `${m[1].slice(2)}/${m[2]}/${m[3]}`;
  }

  function fmtDdMmYyyy(isoDate) {
    if (!isoDate) return '..../..../......';
    const m = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoDate;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function renderOfficialLogo(code, heightPx, fallbackText) {
    const h = heightPx || 38;
    const dataUri = BankLogos && BankLogos[code];
    if (dataUri) {
      return `<img src="${dataUri}" alt="${esc(code)}" style="height:${h}px;max-width:210px;width:auto;object-fit:contain;display:block;" />`;
    }
    return `<span style="display:inline-block;background:#0f223d;color:#ffffff;font-weight:bold;font-size:13px;padding:5px 12px;border-radius:4px;">${esc(fallbackText || code)}</span>`;
  }

  function amountToEnglishWords(amount, currency) {
    const num = Engine.parseNumberSafe(amount);
    if (!Number.isFinite(num) || num <= 0) return '';

    const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
      'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
    const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    const SCALES = ['', 'THOUSAND', 'MILLION', 'BILLION'];

    function threeDigits(n) {
      let s = '';
      const h = Math.floor(n / 100);
      const rem = n % 100;
      if (h > 0) s += ONES[h] + ' HUNDRED';
      if (rem > 0) {
        if (s) s += ' ';
        if (rem < 20) s += ONES[rem];
        else s += TENS[Math.floor(rem / 10)] + (rem % 10 ? '-' + ONES[rem % 10] : '');
      }
      return s;
    }

    function intToWords(n) {
      if (n === 0) return 'ZERO';
      const parts = [];
      let scale = 0;
      while (n > 0) {
        const chunk = n % 1000;
        if (chunk > 0) {
          const w = threeDigits(chunk);
          parts.unshift(SCALES[scale] ? `${w} ${SCALES[scale]}` : w);
        }
        n = Math.floor(n / 1000);
        scale++;
      }
      return parts.join(' ');
    }

    const whole = Math.floor(num);
    const cents = Math.round((num - whole) * 100);
    const currMap = {
      USD: 'UNITED STATES DOLLARS',
      EUR: 'EUROS',
      JPY: 'JAPANESE YEN',
      CNY: 'CHINESE YUAN',
      GBP: 'BRITISH POUNDS',
      VND: 'VIETNAM DONG'
    };
    const currName = currMap[(currency || 'USD').toUpperCase()] || (currency || 'USD').toUpperCase();
    let res = `${currName} ${intToWords(whole)}`;
    if (cents > 0) res += ` AND CENTS ${intToWords(cents)}`;
    return res + ' ONLY';
  }

  function parseField46ACheckboxes(field46A, lcData) {
    const f46 = String(field46A || '').toUpperCase();
    const bank = Engine.getBankInfo(lcData);
    return {
      hasInvoice: /INVOICE/.test(f46),
      hasMarineBL: /BILL OF LADING|B\/L|MARINE/.test(f46),
      hasAirWaybill: /AIR\s*WAYBILL|AWB/.test(f46),
      hasInspection: /INSPECTION/.test(f46),
      hasQualityCert: /QUALITY|QUANTITY|COA|ANALYSIS/.test(f46),
      hasInsurance: /INSURANCE/.test(f46),
      hasCO: /CERTIFICATE OF ORIGIN|C\/O/.test(f46),
      hasPackingList: /PACKING LIST/.test(f46),
      hasBenCert: /BENEFICIARY'?S?\s*CERT/.test(f46),
      isFreightPrepaid: /FREIGHT PREPAID/.test(f46),
      isFreightCollect: /FREIGHT COLLECT/.test(f46),
      blConsignedToBank: f46.includes('ORDER OF') ? `THE ORDER OF ${bank.englishName}` : 'THE ORDER OF ISSUING BANK',
      coDetail: (f46.match(/CERTIFICATE OF ORIGIN[^\n]*/i) || [''])[0],
      insDetail: (f46.match(/INSURANCE[^\n]*/i) || [''])[0],
      benCertDays: (f46.match(/WITHIN\s*(\d{1,2})\s*DAYS/i) || ['', '05'])[1]
    };
  }

  const BANK_META = {
    VCB: {
      primary: '#006837',
      secondary: '#f0fdf4',
      formCode: 'Phụ lục số 16',
      shortLabel: 'Vietcombank',
      pdfSample: 'sample_forms/VCB_Phat_hanh_LC.pdf'
    },
    VPB: {
      primary: '#008744',
      secondary: '#ecfdf5',
      formCode: 'MB01.HDM-TM.N/A.N/A/01',
      shortLabel: 'VPBank',
      pdfSample: 'sample_forms/VPB_1.pdf'
    },
    TCB: {
      primary: '#e31837',
      secondary: '#fef2f2',
      formCode: 'MB01-QT.TTTM/TCB',
      shortLabel: 'Techcombank',
      pdfSample: 'sample_forms/TCB_LC.pdf'
    },
    EIB: {
      primary: '#00569c',
      secondary: '#eff6ff',
      formCode: 'BM01-QĐ18/CL&PTSP KHDN',
      shortLabel: 'Eximbank',
      pdfSample: 'sample_forms/EIB_1.pdf'
    },
    BIDV: {
      primary: '#00524c',
      secondary: '#fefce8',
      formCode: 'Mẫu TTQT-01/BIDV',
      shortLabel: 'BIDV',
      pdfSample: 'sample_forms/ACB_BIDV_search.pdf'
    },
    VTB: {
      primary: '#004b8d',
      secondary: '#eff6ff',
      formCode: 'Mẫu 01/LC-NK-VTB',
      shortLabel: 'VietinBank',
      pdfSample: 'sample_forms/ACB_BIDV_search.pdf'
    },
    ACB: {
      primary: '#0054a6',
      secondary: '#eff6ff',
      formCode: 'Mẫu ACB-TTQT-01/LC',
      shortLabel: 'ACB',
      pdfSample: 'sample_forms/ACB_BIDV_search.pdf'
    },
    MB: {
      primary: '#141ed2',
      secondary: '#eef2ff',
      formCode: 'Mẫu MB-TF-LC01',
      shortLabel: 'MB Bank',
      pdfSample: 'sample_forms/ACB_BIDV_search.pdf'
    },
    STB: {
      primary: '#0054a6',
      secondary: '#e0f2fe',
      formCode: 'Mẫu STB-TTQT-01',
      shortLabel: 'Sacombank',
      pdfSample: 'sample_forms/ACB_BIDV_search.pdf'
    },
    OTHER: {
      primary: '#0f223d',
      secondary: '#f1f5f9',
      formCode: 'Mẫu Chuẩn TTQT-LC-STD',
      shortLabel: 'Ngân hàng khác',
      pdfSample: 'sample_forms/ACB_BIDV_search.pdf'
    }
  };

  /**
   * =========================================================================
   * MẪU 1: VIETCOMBANK (Chuẩn 100% theo PDF Phụ lục số 16)
   * =========================================================================
   */
  function renderVCB(lcData, fin) {
    const bank = fin.bank;
    const docs = parseField46ACheckboxes(lcData.field46A, lcData);
    const inc = (lcData.incoterms || 'CIF').toUpperCase();
    const tenor = (lcData.draftTenor || 'AT SIGHT').toUpperCase();
    const isSight = tenor.includes('SIGHT');
    const isPartial = (lcData.partialShipment || '').toUpperCase() === 'ALLOWED';
    const isTrans = (lcData.transhipment || '').toUpperCase() === 'ALLOWED';
    const wordsAmt = amountToEnglishWords(lcData.amount, lcData.currency);
    const charges71D = (lcData.field71D || '').toUpperCase();
    const otherChargesByBen = charges71D.includes('BENEFICIARY') || charges71D.includes('OUTSIDE VIETNAM');
    const days48 = Number(lcData.field48 || 21);

    return `
      <div style="text-align:right;font-style:italic;font-weight:bold;font-size:12.5px;margin-bottom:2px;">Phụ lục số 16</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
        <tr>
          <td style="width:28%;vertical-align:middle;border:none;padding:0;">${renderOfficialLogo('VCB', 40, 'VIETCOMBANK')}</td>
          <td style="width:44%;text-align:center;vertical-align:middle;border:none;padding:0;">
            <div style="font-size:15.5px;font-weight:bold;letter-spacing:0.3px;">YÊU CẦU PHÁT HÀNH THƯ TÍN DỤNG</div>
          </td>
          <td style="width:28%;border:none;"></td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:8px;">
        <tr>
          <td style="width:62%;vertical-align:top;border:none;padding:2px 0;">
            <b>Kính gửi: Ngân hàng Ngoại thương Việt Nam</b><br/>
            <span style="padding-left:52px;"><b>Chi Nhánh:</b> ${esc(bank.branch)}</span>
          </td>
          <td style="width:38%;vertical-align:top;border:none;padding:2px 0;">
            Ngày nhận : ${esc(fmtDdMmYyyy(lcData.issueDate))}<br/>
            Người nhận: ............................................
          </td>
        </tr>
        <tr>
          <td style="border:none;padding:3px 0;"><i>Tên công ty:</i> <b>${esc(lcData.applicantName)}</b></td>
          <td style="border:none;padding:3px 0;"><i>Số CIF:</i> <b>${esc(lcData.customerCif)}</b></td>
        </tr>
        <tr>
          <td colspan="2" style="border:none;padding:3px 0;">
            ${chk(fin.depositPercent === 100)} Ký quĩ 100% &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            ${chk(fin.depositPercent < 100)} Sử dụng hạn mức giao dịch TTTM tại VCB cấp cho mã CIF
          </td>
        </tr>
      </table>

      <div style="font-size:12.5px;margin-bottom:6px;">Với trách nhiệm thuộc về phần mình, chúng tôi đề nghị ngân hàng phát hành thư tín dụng với nội dung sau:</div>

      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #000;margin-bottom:10px;">
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(1)</b> ${chk(true)} Irrevocable &nbsp;&nbsp;
            ${chk((lcData.form40A || '').includes('TRANSFERABLE'))} Transferable &nbsp;&nbsp;
            ${chk((lcData.field49 || '').toUpperCase() === 'CONFIRM')} Confirmed &nbsp;&nbsp;
            ${chk((lcData.form40A || '').includes('STANDBY'))} Others: ......... &nbsp;&nbsp;&nbsp;
            <b>Letter of Credit issued by</b> ${chk(false)} Mail &nbsp; ${chk(true)} Telex/SWIFT
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border:none;padding:0;width:54%;vertical-align:top;"><b>(2) Expiry Date &amp; Place</b> (yy/mm/dd): <b>${esc(fmtYyMmDdSlash(lcData.expiryDate))}</b> — ${esc(lcData.expiryPlace)}</td>
                <td style="border:none;padding:0;width:46%;vertical-align:top;"><b>(3) Latest Shipment date</b> (yy/mm/dd): <b>${esc(fmtYyMmDdSlash(lcData.latestShipmentDate))}</b></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border:none;padding:0;width:54%;vertical-align:top;"><b>(4) Beneficiary’s Bank</b> (Full name &amp; address)<br/>${esc(lcData.advisingBankName)}</td>
                <td style="border:none;padding:0;width:46%;vertical-align:top;"><b>BIC code</b> (preferably)<br/><b>${esc(lcData.advisingBankBic)}</b></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border:none;padding:0;width:48%;vertical-align:top;"><b>(5) Applicant</b></td>
                <td style="border:none;padding:0;width:52%;vertical-align:top;"><b>CIF No.</b> ${esc(lcData.customerCif)}<br/><b>Full name &amp; address:</b><br/><b>${esc(lcData.applicantName)}</b><br/>${esc(lcData.applicantAddress)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border:none;padding:0;width:48%;vertical-align:top;"><b>(6) Beneficiary</b></td>
                <td style="border:none;padding:0;width:52%;vertical-align:top;"><b>Account No.</b> ...............................<br/><b>Full name &amp; address:</b><br/><b>${esc(lcData.beneficiaryName)}</b><br/>${esc(lcData.beneficiaryAddress)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(7) Currency (ISO)</b> <b><u>${esc(lcData.currency)}</u></b> &nbsp;&nbsp;&nbsp;
            <b>Amount</b> <b><u>${esc(Engine.formatHumanAmount(lcData.amount, ''))}</u></b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            <b>% More or Less Allowed</b> <u>+${esc(lcData.tolerancePlus)}% / -${esc(lcData.toleranceMinus)}%</u><br/>
            <i style="padding-left:18px;">in words:</i> <b>${esc(wordsAmt)}</b>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(8) Drafts to be drawn at</b><br/>
            <span style="padding-left:20px;">
              ${chk(isSight)} <u>&nbsp;AT&nbsp;</u> Sight &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              ${chk(!isSight)} <u>&nbsp;${!isSight ? esc(tenor) : '______'}&nbsp;</u> days after Bill of Lading Date &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              ${chk(false)} Drafts not required
            </span>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border:none;padding:0;width:50%;vertical-align:top;">
                  <b>(9) Partial Shipment</b> (if blank, Partial Shipment will be prohibited)<br/>
                  ${chk(isPartial)} Allowed &nbsp;&nbsp; ${chk(!isPartial)} Not allowed
                </td>
                <td style="border:none;padding:0;width:50%;vertical-align:top;">
                  <b>Transhipment</b> (if blank, transhipment will be prohibited)<br/>
                  ${chk(isTrans)} Allowed &nbsp;&nbsp; ${chk(!isTrans)} Not allowed
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(10) Shipment</b><br/>
            Port of taking in charge <u>${esc(lcData.portOfLoading)}</u> &nbsp;
            Port of loading <b><u>${esc(lcData.portOfLoading)}</u></b> &nbsp;
            Port of discharge <b><u>${esc(lcData.portOfDischarge)}</u></b> &nbsp;
            Port of final destination <u>${esc(lcData.portOfDischarge)}</u>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(11) Shipping Terms (INCOTERMS 2020)</b><br/>
            <span style="padding-left:28px;">
              ${chk(inc === 'FOB')} FOB &nbsp; ${chk(inc === 'CPT')} CPT &nbsp; ${chk(inc === 'FCA')} FCA &nbsp;
              ${chk(inc === 'CIF')} CIF &nbsp; ${chk(inc === 'CFR')} CFR &nbsp; ${chk(inc === 'EXW')} EXW &nbsp;
              ${chk(inc === 'CIP')} CIP &nbsp; ${chk(!['FOB','CPT','FCA','CIF','CFR','EXW','CIP'].includes(inc))} Other ${!['FOB','CPT','FCA','CIF','CFR','EXW','CIP'].includes(inc) ? esc(inc) : '______'}
            </span><br/>
            <i style="padding-left:28px;">Named port / place of Destination:</i> <b>${esc(lcData.portOfDischarge)}</b>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(12) Description of goods and/ or Services</b>
            <div style="white-space:pre-wrap;margin-top:3px;">${esc(lcData.field45A)}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(13) Document required</b><br/>
            This documentary credit is available against presentation of the following documents:<br/>
            ${chk(docs.hasInvoice)} signed commercial invoice, <u>03</u> original, <u>03</u> copies.<br/>
            ${chk(docs.hasMarineBL)} full set original clean shipped on board marine bills of lading, made out to <u>${esc(docs.blConsignedToBank)}</u>, marked <u>${docs.isFreightPrepaid ? 'FREIGHT PREPAID' : (docs.isFreightCollect ? 'FREIGHT COLLECT' : '______')}</u>, notifying <u>${esc(lcData.applicantName)}</u>.<br/>
            ${chk(docs.hasAirWaybill)} air waybill, original 3 (for shipper) consigned to <u>${docs.hasAirWaybill ? esc(bank.englishName) : '__________________'}</u>.<br/>
            ${chk(docs.hasInspection)} Inspection certificate issued by <u>independent agency</u> in <u>01</u> original, <u>02</u> copies.<br/>
            ${chk(docs.hasQualityCert)} Certificate of quality and quantity issued by <u>Manufacturer / SGS</u> in <u>01</u> original, <u>02</u> copies.<br/>
            ${chk(docs.hasInsurance)} full set negotiable policy/certificate of insurance, covering <u>Institute Cargo Clauses (A), War &amp; Strikes risks for 110% invoice value</u>.<br/>
            ${chk(docs.hasCO)} certificate of origin, certified by authority, 1 original, <u>02</u> copies (${esc(docs.coDetail || 'as per L/C')}).<br/>
            ${chk(docs.hasPackingList)} packing list, <u>03</u>-fold.<br/>
            ${chk(docs.hasBenCert)} Beneficiary’s Certificate certifying that one set of non negotiable documents plus <u>shipping particulars</u> have been sent by Express courier to the applicant within <u>${esc(docs.benCertDays)}</u> days after B/L date enclosing it’s receipt.<br/>
            ${chk(false)} Other documents: (please specify) ____________________________________________________
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(14) Additional conditions:</b><br/>
            ${chk(true)} Documents must be issued in English<br/>
            ${chk(true)} The amount utilized must be endorsed on the reverse of the original L/C.<br/>
            <div style="white-space:pre-wrap;margin-top:3px;font-size:11.5px;">${esc(lcData.field47A)}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(15) Charges:</b><br/>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border:none;padding:0;width:50%;"><i>Issuing bank’s charges for the account of</i><br/>${chk(true)} Applicant &nbsp;&nbsp;&nbsp;&nbsp; ${chk(false)} Beneficiary</td>
                <td style="border:none;padding:0;width:50%;"><i>Other banks’ charges for the account of</i><br/>${chk(!otherChargesByBen)} Applicant &nbsp;&nbsp;&nbsp;&nbsp; ${chk(otherChargesByBen)} Beneficiary</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(16) Period for presentation:</b><br/>
            ${chk(days48 === 21)} 21 days after shipment date &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            ${chk(days48 !== 21)} Other: <b>${days48 !== 21 ? `${days48} days after shipment date` : '__________________'}</b>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;">
            <b>(17) Instruction to Paying/ Accepting/ Negotiating Bank:</b><br/>
            Upon receipt of ${chk(true)} the Tested Telex/ Swift &nbsp;&nbsp; ${chk(true)} the Documents which are complied with the terms and conditions of this Credit, we make payments/ acceptances as instructions of Paying/ Accepting/ Negotiating Bank.
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;"><b>(18) Other Instructions:</b> ${esc(lcData.field78)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #000;padding:5px 7px;"><b>This credit is subject to the Uniform Customs and Practice for Documentary Credits International Chamber of Commerce, Prevailing Publication.</b></td>
        </tr>
      </table>

      <div style="border:1px solid #000;padding:7px 9px;margin-bottom:8px;font-size:11px;">
        <b>Uỷ quyền và cam kết của bên bảo lãnh</b> <i>(chỉ dùng cho LC phát hành bằng hạn mức của bên thứ ba không phải người mở LC)</i><br/>
        Chúng tôi: ..................................................... Địa chỉ: ......................................... CIF số: .......................<br/>
        Xin được cùng với <b>${esc(lcData.applicantName)}</b> đề nghị Ngân hàng phát hành thư tín dụng với nội dung nêu trên và chịu hoàn toàn trách nhiệm liên đới thanh toán nếu bên yêu cầu phát hành LC không có khả năng thanh toán khi đến hạn.
      </div>

      <div style="border:1px solid #000;padding:8px 10px;font-size:11px;text-align:justify;">
        <b>Cam kết của bên yêu cầu mở LC</b><br/>
        <b>1.</b> Thư tín dụng này được mở theo Hợp đồng thương mại số <b>${esc(lcData.contractNo)}</b> ngày <b>${esc(lcData.contractDate)}</b>. Đơn vị chúng tôi cam kết chịu hoàn toàn trách nhiệm về giấy phép Nhập khẩu của mặt hàng Nhập khẩu theo Thư tín dụng này.<br/>
        <b>2.</b> Thư tín dụng này tuân thủ theo Qui tắc về thực hành thống nhất tín dụng chứng từ ấn phẩm hiện hành của Phòng thương mại quốc tế (ICC).<br/>
        <b>3. Nguồn vốn thanh toán</b><br/>
        ${chk(true)} Chúng tôi cam kết đảm bảo nguồn vốn thanh toán LC theo các nguồn sau:
        <table style="width:100%;border-collapse:collapse;margin:4px 0;font-size:11px;">
          <tr>
            <th style="border:1px solid #334155;padding:3px;">Nguồn vốn</th>
            <th style="border:1px solid #334155;padding:3px;">Tỷ lệ</th>
            <th style="border:1px solid #334155;padding:3px;">Số tiền</th>
            <th style="border:1px solid #334155;padding:3px;">Số tài khoản</th>
          </tr>
          <tr>
            <td style="border:1px solid #334155;padding:3px;">${chk(fin.depositPercent > 0)} Kí quĩ</td>
            <td style="border:1px solid #334155;padding:3px;">${fin.depositPercent}%</td>
            <td style="border:1px solid #334155;padding:3px;"><b>${esc(Engine.formatHumanAmount(fin.depositAmountForeign, lcData.currency))}</b></td>
            <td style="border:1px solid #334155;padding:3px;">${esc(lcData.debitAccountNo)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #334155;padding:3px;">${chk(fin.creditLineUsedForeign > 0)} Vay / Hạn mức tín dụng</td>
            <td style="border:1px solid #334155;padding:3px;">${100 - fin.depositPercent}%</td>
            <td style="border:1px solid #334155;padding:3px;"><b>${esc(Engine.formatHumanAmount(fin.creditLineUsedForeign, lcData.currency))}</b></td>
            <td style="border:1px solid #334155;padding:3px;">${esc(lcData.creditFacilityRef || '—')}</td>
          </tr>
          <tr>
            <td style="border:1px solid #334155;padding:3px;">${chk(false)} Miễn kí quĩ, tự cân đối thanh toán</td>
            <td style="border:1px solid #334155;padding:3px;">0%</td>
            <td style="border:1px solid #334155;padding:3px;">—</td>
            <td style="border:1px solid #334155;padding:3px;">${esc(lcData.debitAccountNo)}</td>
          </tr>
        </table>
        <b>4. Thực hiện thanh toán Thư tín dụng:</b><br/>
        <b>4.1.</b> Thực hiện theo các thỏa thuận tại Hợp đồng tín dụng (nếu thanh toán bằng vốn vay từ Vietcombank).<br/>
        <b>4.2.</b> Cam kết tự cân đối: (a) Có đủ ngoại tệ thanh toán ngay khi nhận thông báo bộ chứng từ/điện đòi tiền; (b) Ủy quyền cho Vietcombank tự động trích nợ tất cả các tài khoản tại Vietcombank để thanh toán; (c) Nếu không đủ ngoại tệ, xin nhận nợ vay bắt buộc với mức lãi suất bằng <b>150% lãi suất cho vay thông thường</b>, hoàn trả trong vòng <b>15 ngày</b> và chịu phí vi phạm thu xếp ngoại tệ tối đa <b>8%</b>; (d) Thực hiện mua ngoại tệ của Vietcombank nếu không đủ ngoại tệ.<br/>
        <b>5.</b> Không viện dẫn tranh chấp giữa Bên đề nghị phát hành LC với Vietcombank và/hoặc bên thứ ba nào làm lý do từ chối nghĩa vụ thanh toán.<br/>
        <b>6. Phí ngân hàng:</b>
        <table style="width:100%;border-collapse:collapse;margin:4px 0;font-size:11px;text-align:center;">
          <tr>
            <th style="border:1px solid #334155;padding:3px;">Bên chịu phí</th>
            <th style="border:1px solid #334155;padding:3px;">Phí trong nước</th>
            <th style="border:1px solid #334155;padding:3px;">Phí ngoài nước</th>
            <th style="border:1px solid #334155;padding:3px;">Phí xác nhận</th>
            <th style="border:1px solid #334155;padding:3px;">Số tài khoản</th>
          </tr>
          <tr>
            <td style="border:1px solid #334155;padding:3px;text-align:left;">Người mở LC</td>
            <td style="border:1px solid #334155;padding:3px;">${chk(true)}</td>
            <td style="border:1px solid #334155;padding:3px;">${chk(!otherChargesByBen)}</td>
            <td style="border:1px solid #334155;padding:3px;">${chk((lcData.field49 || '').toUpperCase() === 'CONFIRM')}</td>
            <td style="border:1px solid #334155;padding:3px;">${esc(lcData.debitAccountNo)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #334155;padding:3px;text-align:left;">Người hưởng</td>
            <td style="border:1px solid #334155;padding:3px;">${chk(false)}</td>
            <td style="border:1px solid #334155;padding:3px;">${chk(otherChargesByBen)}</td>
            <td style="border:1px solid #334155;padding:3px;">${chk(false)}</td>
            <td style="border:1px solid #334155;padding:3px;">Trừ tiền L/C</td>
          </tr>
        </table>
      </div>

      <div class="signature-row" style="font-size:12px;">
        <div class="signature-box" style="text-align:left;">
          <i>Khi cần liên hệ với:</i><br/>
          Ông/Bà: ....................................<br/>
          Số điện thoại: ............................
        </div>
        <div class="signature-box">
          <b>Kế toán trưởng (nếu có)</b><br/><i>(Ký tên)</i>
        </div>
        <div class="signature-box">
          <i>..........., ngày ..... tháng ..... năm ........</i><br/>
          <b>Chủ tài khoản</b><br/><i>(Ký tên, đóng dấu)</i><br/><br/><br/>
          <b>${esc(lcData.legalRepName)}</b>
        </div>
      </div>
    `;
  }

  /**
   * =========================================================================
   * MẪU 2: VPBANK (Chuẩn 100% theo PDF MB01.HDM-TM.N/A.N/A/01)
   * =========================================================================
   */
  function renderVPB(lcData, fin) {
    const docs = parseField46ACheckboxes(lcData.field46A, lcData);
    const tenor = (lcData.draftTenor || 'AT SIGHT').toUpperCase();
    const isSight = tenor.includes('SIGHT');
    const availBy = (lcData.availableBy || 'BY PAYMENT').toUpperCase();
    const isConfirm = (lcData.field49 || '').toUpperCase() === 'CONFIRM';

    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div>${renderOfficialLogo('VPB', 44, 'VPBank')}</div>
        <div style="text-align:right;font-size:11px;color:#334155;">
          <b>MB01.HDM-TM.N/A.N/A/01</b><br/>
          Đề nghị phát hành thư tín dụng
        </div>
      </div>
      <div style="text-align:center;margin-bottom:10px;">
        <div style="font-size:15px;font-weight:bold;">ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG (L/C)</div>
        <div style="font-size:12px;font-style:italic;">APPLICATION FOR LETTER OF CREDIT ISSUANCE</div>
      </div>
      <div style="font-size:12px;margin-bottom:8px;">
        <b><u>Kính gửi:</u> NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN VIỆT NAM THỊNH VƯỢNG - VPBANK</b><br/>
        <i>To: VIETNAM PROSPERITY JOINT STOCK COMMERCIAL BANK – VPBANK</i> &nbsp;&nbsp;&nbsp;&nbsp; Ngày (Date): <b>${esc(fmtDdMmYyyy(lcData.issueDate))}</b>
      </div>

      <div style="font-weight:bold;font-size:12.5px;margin:8px 0 4px;">I. THÔNG TIN KHÁCH HÀNG <i>(CUSTOMER’S INFORMATION)</i></div>
      <div style="font-size:12px;margin-bottom:8px;padding-left:8px;">
        - Khách hàng <i>(Name of Customer)</i>: <span style="background:#f1f5f9;padding:2px 6px;"><b>${esc(lcData.applicantName)}</b></span><br/>
        - Số CIF tại VPBank <i>(CIF No.)</i>: <span style="background:#f1f5f9;padding:2px 6px;"><b>${esc(lcData.customerCif)}</b></span> &nbsp;|&nbsp; MST: <b>${esc(lcData.applicantTaxId || '0312456789')}</b><br/>
        - Thông tin liên hệ <i>(Contact point)</i>: <b>${esc(lcData.legalRepName)}</b>
      </div>

      <div style="font-weight:bold;font-size:12.5px;margin:8px 0 4px;">II. THÔNG TIN THƯ TÍN DỤNG <i>(DOCUMENTARY CREDIT DETAILS)</i></div>
      <div style="font-size:11.5px;margin-bottom:6px;font-style:italic;">
        Với mọi trách nhiệm thuộc về phần mình, Chúng tôi (“Khách Hàng”) đề nghị VPBank phát hành Thư tín dụng (“L/C”) không hủy ngang với các nội dung sau:
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:11.5px;border:1px dotted #334155;margin-bottom:10px;">
        <tr>
          <td style="width:50%;border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>Loại L/C <i>(Type of credit)</i> *:</b><br/>
            ${chk((lcData.form40A || '').includes('TRANSFERABLE'))} Transferable &nbsp;&nbsp;
            ${chk(isSight)} L/C trả ngay (L/C at Sight)<br/>
            ${chk(!isSight)} L/C trả chậm (Usance L/C) &nbsp;&nbsp;
            ${chk(false)} UPAS
          </td>
          <td style="width:50%;border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>F31D: Ngày và nơi hết hạn <i>(Date and Place of expiry)</i> *:</b><br/>
            <div style="background:#f1f5f9;padding:3px 7px;margin-top:3px;">Ngày: <b>${esc(lcData.expiryDate)}</b> &nbsp;&nbsp; Tại/In: <b>${esc(lcData.expiryPlace)}</b></div>
          </td>
        </tr>
        <tr>
          <td style="border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>F57: Ngân hàng thông báo <i>(Advising Bank)</i></b><br/>
            Tên (Name) *: <div style="background:#f1f5f9;padding:2px 6px;">${esc(lcData.advisingBankName)}</div>
            Mã Swift (Swift code) *: <span style="background:#f1f5f9;padding:2px 6px;"><b>${esc(lcData.advisingBankBic)}</b></span>
          </td>
          <td style="border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>Ngân hàng chuyển nhượng, nếu có <i>(Transferring bank, if any)</i></b><br/>
            Tên (Name): Không áp dụng<br/>
            Mã Swift (Swift code): —
          </td>
        </tr>
        <tr>
          <td style="border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>F59: Người hưởng lợi (Tên và địa chỉ) *</b>
            <div style="background:#f1f5f9;padding:4px 7px;margin-top:3px;"><b>${esc(lcData.beneficiaryName)}</b><br/>${esc(lcData.beneficiaryAddress)}</div>
          </td>
          <td style="border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>F50: Người yêu cầu phát hành L/C (Tên và địa chỉ) *</b>
            <div style="background:#f1f5f9;padding:4px 7px;margin-top:3px;"><b>${esc(lcData.applicantName)}</b><br/>${esc(lcData.applicantAddress)}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>F32B: Loại tiền và số tiền <i>(Currency code, Amount)</i> *:</b>
            <div style="background:#f1f5f9;padding:3px 7px;margin-top:3px;"><b>${esc(Engine.formatHumanAmount(lcData.amount, lcData.currency))}</b></div>
          </td>
          <td style="border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>F39A: Dung sai <i>(Tolerance)</i>:</b><br/>
            ${chk(Number(lcData.tolerancePlus) > 0 || Number(lcData.toleranceMinus) > 0)} In amount: + <b>${esc(lcData.tolerancePlus)}</b>% / - <b>${esc(lcData.toleranceMinus)}</b>%
          </td>
        </tr>
        <tr>
          <td style="border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>F41D: Có giá trị xuất trình tại <i>(Credit available with)</i> *:</b><br/>
            ${chk(false)} Any bank &nbsp; ${chk(isConfirm)} Confirming bank &nbsp; ${chk(true)} The following bank: ${esc(lcData.advisingBankBic)}<br/>
            <b>Để/By:</b> ${chk(availBy.includes('NEGOTIATION'))} Negotiation &nbsp; ${chk(availBy.includes('ACCEPTANCE'))} Acceptance &nbsp; ${chk(availBy === 'BY PAYMENT')} Payment &nbsp; ${chk(availBy.includes('DEF'))} Deferred payment
          </td>
          <td style="border:1px dotted #334155;padding:6px 8px;vertical-align:top;">
            <b>F42C: Điều khoản thanh toán <i>(Payment Terms)</i> *:</b><br/>
            ${chk(isSight)} At sight for 100% Invoice value<br/>
            ${chk(!isSight)} At ${!isSight ? esc(tenor) : '___ days after ___'} for 100% Invoice value<br/>
            <b>Yêu cầu hối phiếu *:</b> ${chk(true)} Có yêu cầu &nbsp; ${chk(false)} Không yêu cầu
          </td>
        </tr>
        <tr>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F43P: Giao hàng từng phần:</b> <span style="background:#f1f5f9;padding:2px 6px;"><b>${esc(lcData.partialShipment)}</b></span></td>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F43T: Chuyển tải:</b> <span style="background:#f1f5f9;padding:2px 6px;"><b>${esc(lcData.transhipment)}</b></span></td>
        </tr>
        <tr>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F44A: Nơi giao hàng:</b> ${esc(lcData.portOfLoading)}</td>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F44B: Nơi nhận hàng:</b> ${esc(lcData.portOfDischarge)}</td>
        </tr>
        <tr>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F44E: Cảng bốc hàng/Cảng đi:</b><div style="background:#f1f5f9;padding:2px 6px;margin-top:2px;"><b>${esc(lcData.portOfLoading)}</b></div></td>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F44F: Cảng dỡ hàng/Cảng đến:</b><div style="background:#f1f5f9;padding:2px 6px;margin-top:2px;"><b>${esc(lcData.portOfDischarge)}</b></div></td>
        </tr>
        <tr>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F44C: Ngày giao hàng muộn nhất:</b> <span style="background:#f1f5f9;padding:2px 6px;"><b>${esc(lcData.latestShipmentDate)}</b></span></td>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F44D: Thời hạn giao hàng:</b> Theo mục F44C</td>
        </tr>
        <tr>
          <td colspan="2" style="border:1px dotted #334155;padding:6px 8px;">
            <b>F45A: Mô tả hàng hóa/dịch vụ <i>(Description of goods/service(s))</i> *:</b>
            <div style="background:#f1f5f9;padding:4px 7px;white-space:pre-wrap;margin-top:3px;">${esc(lcData.field45A)}</div>
            <div style="margin-top:4px;"><b>Incoterms:</b> <span style="background:#f1f5f9;padding:2px 6px;"><b>${esc(lcData.incoterms)} 2020</b></span></div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="border:1px dotted #334155;padding:6px 8px;">
            <b>F46A: Chứng từ yêu cầu <i>(Documents required)</i> *:</b><br/>
            1. ${chk(docs.hasInvoice)} Signed Commercial Invoice showing in 03 original(s) and 03 copy(ies).<br/>
            2. ${chk(docs.hasMarineBL)} Clean shipped on board Marine Bill of Lading made out to order of <b>Vietnam Prosperity Joint Stock Commercial Bank (VPBank)</b>, notify the applicant, marked Freight ${chk(docs.isFreightPrepaid)} Prepaid ${chk(docs.isFreightCollect)} Collect in 3/3 Original(s).<br/>
            3. ${chk(docs.hasAirWaybill)} Clean Airway Bill consigned to VPBank.<br/>
            5. ${chk(docs.hasInsurance)} Full set of original Insurance policy/certificate for not less than 110 pct of shipped goods value, covering Institute Cargo Clauses [X] A.<br/>
            6. ${chk(docs.hasPackingList)} Packing List in 03 original(s). &nbsp;&nbsp; 7. ${chk(docs.hasCO)} Certificate of Origin in 01 original(s) and 02 copy(ies).<br/>
            <div style="background:#f1f5f9;padding:4px 7px;white-space:pre-wrap;margin-top:3px;">${esc(lcData.field46A)}</div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="border:1px dotted #334155;padding:6px 8px;">
            <b>F47A: Các điều kiện bổ sung <i>(Additional conditions)</i> *:</b>
            <div style="background:#f1f5f9;padding:4px 7px;white-space:pre-wrap;margin-top:3px;">${esc(lcData.field47A)}</div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="border:1px dotted #334155;padding:6px 8px;">
            <b>F71D: Phí <i>(Charges)</i> *:</b> <span style="background:#f1f5f9;padding:2px 6px;">${esc(lcData.field71D)}</span><br/>
            <b>F48: Thời hạn xuất trình:</b> Documents to be presented within <span style="background:#f1f5f9;padding:2px 6px;"><b>${esc(lcData.field48)}</b></span> days after shipment date but within the validity of the credit.
          </td>
        </tr>
        <tr>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F49: Chỉ dẫn xác nhận *:</b> ${chk(!isConfirm)} Without &nbsp; ${chk(isConfirm)} Confirm &nbsp; ${chk((lcData.field49 || '') === 'MAY ADD')} May add</td>
          <td style="border:1px dotted #334155;padding:6px 8px;"><b>F58: Ngân hàng xác nhận, nếu có:</b> —</td>
        </tr>
        <tr>
          <td colspan="2" style="border:1px dotted #334155;padding:6px 8px;">
            <b>Hợp đồng mua bán hàng hóa, dịch vụ giữa Khách hàng và Bên thụ hưởng *:</b> Số (No.): <b>${esc(lcData.contractNo)}</b> — Ngày (dated): <b>${esc(lcData.contractDate)}</b>
          </td>
        </tr>
      </table>

      <div style="font-weight:bold;font-size:12.5px;margin:8px 0 4px;">III. THÔNG TIN ĐỀ NGHỊ CẤP TÍN DỤNG / <i>CREDIT INFORMATION</i></div>
      <div style="font-size:11.5px;border:1px dotted #334155;padding:7px 9px;margin-bottom:8px;">
        <b>3. Biện pháp bảo đảm &amp; Nguồn tiền thanh toán:</b><br/>
        ${chk(fin.depositPercent > 0)} Ký quỹ (Margin Deposit): <b>${fin.depositPercent}%</b> — Số tiền ký quỹ: <b>${esc(Engine.formatHumanAmount(fin.depositAmountForeign, lcData.currency))}</b> (≈ ${fin.depositAmountVnd.toLocaleString('en-US')} VND)<br/>
        ${chk(fin.creditLineUsedForeign > 0)} Biện pháp bảo đảm khác / Hạn mức tín dụng: <b>${esc(Engine.formatHumanAmount(fin.creditLineUsedForeign, lcData.currency))}</b> (HĐ số: <b>${esc(lcData.creditFacilityRef || '—')}</b>)<br/>
        <b>4. Chỉ dẫn tài khoản <i>(Account instruction)</i>:</b> TK trích ký quỹ / thu phí / thanh toán: <b>${esc(lcData.debitAccountNo)}</b> (Dự tính phí: USD ${fin.totalBankFeeUsd.toFixed(2)})
      </div>

      <div style="font-weight:bold;font-size:12.5px;margin:6px 0 4px;">IV. CAM KẾT CỦA BÊN YÊU CẦU PHÁT HÀNH L/C <i>(APPLICANT’S UNDERTAKINGS)</i></div>
      <div style="font-size:11px;text-align:justify;margin-bottom:8px;">
        1. Chịu mọi trách nhiệm đối với các nội dung trong Đề nghị phát hành L/C này. &nbsp;
        2. Xuất trình Tờ khai Hải quan trong vòng 30 ngày kể từ ngày VPBank thanh toán/chấp nhận. &nbsp;
        3. Ủy quyền VPBank tự động ghi nợ bất kỳ tài khoản nào tại VPBank để trích ký quỹ, thu phí và thanh toán L/C. &nbsp;
        4. Đề nghị phát hành L/C này là phụ lục không tách rời của Hợp đồng cấp hạn mức/Thỏa thuận khung.
      </div>
      <div class="signature-row" style="font-size:11.5px;">
        <div class="signature-box"><b>Chủ tài khoản</b><br/><i>(Account holder)</i></div>
        <div class="signature-box"><b>Kế toán trưởng (nếu có)</b><br/><i>(Chief Accountant)</i></div>
        <div class="signature-box"><b>Đại diện Khách hàng</b><br/><i>(Ký, ghi rõ họ tên và đóng dấu)</i><br/><br/><br/><b>${esc(lcData.legalRepName)}</b></div>
      </div>
      <div style="border-top:1px dashed #64748b;margin-top:6px;padding-top:6px;text-align:center;font-size:11.5px;">
        <b>CHẤP THUẬN CỦA NGÂN HÀNG — ĐẠI DIỆN VPBANK</b><br/>
        <i>VPBank chấp thuận phát hành L/C theo đề nghị của Khách Hàng nêu trên (Ký, ghi rõ họ tên và đóng dấu)</i>
      </div>
      <div style="background:linear-gradient(90deg,#008744,#16a34a);color:#fff;padding:4px 10px;font-size:11px;font-style:italic;margin-top:8px;">Vì một Việt Nam thịnh vượng</div>
    `;
  }

  /**
   * =========================================================================
   * MẪU 3: TECHCOMBANK (Chuẩn 100% theo TCB_LC.pdf / TCB_1.pdf)
   * =========================================================================
   */
  function renderTCB(lcData, fin) {
    const bank = fin.bank;
    const isSight = (lcData.draftTenor || '').toUpperCase().includes('SIGHT');

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #e31837;padding-bottom:6px;margin-bottom:8px;">
        <div>${renderOfficialLogo('TCB', 38, 'TECHCOMBANK')}</div>
        <div style="text-align:right;font-size:11px;">
          <div>Mã hiệu: <b>MB01-QT.TTTM/TCB</b></div>
          <div>Tuân thủ Luật TCTD 32/2024/QH15 &amp; TT 21/2024/TT-NHNN</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:8px;">
        <div style="font-size:15px;font-weight:bold;">YÊU CẦU PHÁT HÀNH THƯ TÍN DỤNG</div>
        <div style="font-size:11.5px;font-style:italic;">APPLICATION FOR LETTER OF CREDIT</div>
        <div style="font-size:11.5px;">Kính gửi: Ngân hàng TMCP Kỹ thương Việt Nam (TCB) — ${esc(bank.branch)}</div>
      </div>

      <table class="bank-table" style="font-size:11.5px;">
        <tr>
          <th colspan="2" style="background:#9ca3af;color:#0f172a;">I. THÔNG TIN KHÁCH HÀNG / CUSTOMER INFORMATION</th>
        </tr>
        <tr>
          <td style="width:55%;">Tên Doanh nghiệp/<i>Customer name</i>: <b>${esc(lcData.applicantName)}</b><br/>Địa chỉ/<i>Address</i>: ${esc(lcData.applicantAddress)}<br/>Người đại diện hợp pháp: <b>${esc(lcData.legalRepName)}</b></td>
          <td style="width:45%;">Mã khách hàng (*): <b>${esc(lcData.customerCif)}</b><br/>Mã số thuế/<i>Tax code</i>: <b>${esc(lcData.applicantTaxId || '0312456789')}</b><br/>Số TK thu phí &amp; ký quỹ (**): <b>${esc(lcData.debitAccountNo)}</b></td>
        </tr>
        <tr>
          <td colspan="2" style="font-size:10.5px;font-style:italic;color:#475569;">
            (*) Mã khách hàng là số tham chiếu định danh khách hàng tại TCB (8 số giữa của số tài khoản tiền gửi thanh toán từ số thứ 4 đến số thứ 11).
          </td>
        </tr>
        <tr>
          <th colspan="2" style="background:#9ca3af;color:#0f172a;">II. NỘI DUNG THƯ TÍN DỤNG ĐỀ NGHỊ PHÁT HÀNH / L/C DETAILS</th>
        </tr>
        <tr>
          <td><b>40A. Loại L/C:</b> ${esc(lcData.form40A)}</td>
          <td><b>31D. Ngày &amp; nơi hết hạn:</b> <b>${esc(lcData.expiryDate)}</b> — ${esc(lcData.expiryPlace)}</td>
        </tr>
        <tr>
          <td><b>59. Người thụ hưởng (Beneficiary):</b><br/><b>${esc(lcData.beneficiaryName)}</b><br/>${esc(lcData.beneficiaryAddress)}</td>
          <td><b>57A. Ngân hàng thông báo (Advising Bank):</b><br/>${esc(lcData.advisingBankName)}<br/>SWIFT BIC: <b>${esc(lcData.advisingBankBic)}</b></td>
        </tr>
        <tr>
          <td><b>32B. Trị giá L/C &amp; 39A. Dung sai:</b><br/><b>${esc(Engine.formatHumanAmount(lcData.amount, lcData.currency))}</b> (+${esc(lcData.tolerancePlus)}% / -${esc(lcData.toleranceMinus)}%)</td>
          <td><b>41D / 42C / 42A. Điều khoản thanh toán:</b><br/>${esc(lcData.availableBy)} — <b>${esc(lcData.draftTenor)}</b> — Drawee: ${esc(lcData.draweeBic)}</td>
        </tr>
        <tr>
          <td><b>44E / 44F. Tuyến cảng &amp; 44C. Ngày giao hàng muộn nhất:</b><br/>POL: ${esc(lcData.portOfLoading)} → POD: ${esc(lcData.portOfDischarge)}<br/>Latest Shipment Date (:44C:): <b>${esc(lcData.latestShipmentDate)}</b></td>
          <td><b>43P / 43T &amp; Incoterms:</b><br/>Partial (:43P:): ${esc(lcData.partialShipment)} | Tranship (:43T:): ${esc(lcData.transhipment)}<br/>Incoterms: <b>${esc(lcData.incoterms)} 2020</b></td>
        </tr>
        <tr>
          <td colspan="2"><b>45A. Mô tả hàng hóa / dịch vụ:</b><div style="white-space:pre-wrap;margin-top:2px;">${esc(lcData.field45A)}</div></td>
        </tr>
        <tr>
          <td colspan="2"><b>46A. Bộ chứng từ yêu cầu:</b><div style="white-space:pre-wrap;margin-top:2px;">${esc(lcData.field46A)}</div></td>
        </tr>
        <tr>
          <td colspan="2"><b>47A. Điều kiện bổ sung, Phí (:71D:) &amp; Thời hạn xuất trình (:48:):</b><div style="white-space:pre-wrap;margin-top:2px;">${esc(lcData.field47A)}\nPhí ngoài VN (:71D:): ${esc(lcData.field71D)} | Xuất trình (:48:): ${esc(lcData.field48)} ngày | Xác nhận (:49:): ${esc(lcData.field49)}</div></td>
        </tr>
        <tr>
          <th colspan="2" style="background:#9ca3af;color:#0f172a;">III. THÔNG TIN KHÁC &amp; KÝ QUỸ / OTHER INFORMATION &amp; MARGIN</th>
        </tr>
        <tr>
          <td colspan="2">
            <b>1. Căn cứ Hợp đồng:</b> Số <b>${esc(lcData.contractNo)}</b> ngày <b>${esc(lcData.contractDate)}</b><br/>
            <b>2. Ký quỹ &amp; Bảo đảm:</b> Ký quỹ ${fin.depositPercent}% = <b>${esc(Engine.formatHumanAmount(fin.depositAmountForeign, lcData.currency))}</b> | Hạn mức sử dụng: <b>${esc(Engine.formatHumanAmount(fin.creditLineUsedForeign, lcData.currency))}</b> (HĐHM: ${esc(lcData.creditFacilityRef || 'Không')})<br/>
            <b>4. Điều khoản Lãi phải trả đối với UPAS L/C (theo Thông tư 21/2024/TT-NHNN):</b> ${chk(!isSight)} Áp dụng nếu L/C trả chậm có thỏa thuận bên thụ hưởng được thanh toán trả ngay (UPAS LC) — Khách hàng chịu toàn bộ lãi và phí phát sinh liên quan đến việc chiết khấu/tài trợ trả ngay cho bên thụ hưởng theo thỏa thuận với TCB.
          </td>
        </tr>
        <tr>
          <th colspan="2" style="background:#9ca3af;color:#0f172a;">IV. CAM KẾT CỦA KHÁCH HÀNG VÀ CÁC ĐIỀU KHOẢN CHUNG</th>
        </tr>
        <tr>
          <td colspan="2" style="font-size:11px;text-align:justify;">
            Chúng tôi cam kết thông tin kê khai là đúng sự thật, chấp nhận ủy quyền cho TCB tự động trích tài khoản để phong tỏa ký quỹ, thu phí và thanh toán bộ chứng từ hợp lệ theo UCP 600. <b>Điều khoản giải quyết tranh chấp:</b> Mọi tranh chấp phát sinh liên quan đến Yêu cầu phát hành L/C này trước hết được giải quyết thông qua thương lượng; nếu không đạt được thỏa thuận sẽ được đưa ra Tòa án nhân dân có thẩm quyền tại Việt Nam giải quyết theo pháp luật Việt Nam. Mẫu biểu được lập bằng tiếng Việt và tiếng Anh; trường hợp có sự khác nhau về cách hiểu, bản tiếng Việt được ưu tiên làm căn cứ pháp lý.
          </td>
        </tr>
      </table>

      <div class="signature-row" style="font-size:11.5px;margin-top:10px;">
        <div class="signature-box"><i>Ngày/Date: ${esc(fmtDdMmYyyy(lcData.issueDate))}</i></div>
        <div class="signature-box"><b>Kế toán trưởng (Người phụ trách kế toán)</b><br/><i>Chief Accountant (Ký, ghi rõ họ tên)</i></div>
        <div class="signature-box"><b>Người đại diện hợp pháp của Chủ tài khoản</b><br/><i>Legal Representative (Ký, ghi rõ họ tên, đóng dấu)</i><br/><br/><b>${esc(lcData.legalRepName)}</b></div>
      </div>

      <table class="bank-table" style="font-size:10.5px;margin-top:6px;">
        <tr><th colspan="4" style="background:#cbd5e1;text-align:center;">Phần dành cho ngân hàng / Bank only</th></tr>
        <tr style="text-align:center;">
          <td style="width:25%;height:65px;"><b>Người nhận hồ sơ (RM/ARM)</b><br/><i>Application form recipient</i></td>
          <td style="width:25%;"><b>Giao dịch viên</b><br/><i>Teller</i></td>
          <td style="width:25%;"><b>Kiểm soát viên</b><br/><i>Supervisor</i></td>
          <td style="width:25%;"><b>Người đại diện của TCB</b><br/><i>Representative of TCB</i></td>
        </tr>
      </table>
    `;
  }

  /**
   * =========================================================================
   * MẪU 4: EXIMBANK (Chuẩn 100% theo PDF BM01-QĐ18/CL&PTSP KHDN)
   * =========================================================================
   */
  function renderEIB(lcData, fin) {
    const bank = fin.bank;
    const docs = parseField46ACheckboxes(lcData.field46A, lcData);
    const tenor = (lcData.draftTenor || 'AT SIGHT').toUpperCase();
    const isSight = tenor.includes('SIGHT');
    const inc = (lcData.incoterms || 'CIF').toUpperCase();
    const availBy = (lcData.availableBy || 'BY PAYMENT').toUpperCase();
    const isConfirm = (lcData.field49 || '').toUpperCase() === 'CONFIRM';

    return `
      <table style="width:100%;border-collapse:collapse;border-bottom:1.5px solid #334155;margin-bottom:8px;">
        <tr>
          <td style="width:45%;padding-bottom:6px;border:none;">${renderOfficialLogo('EIB', 38, 'EXIMBANK')}</td>
          <td style="width:55%;text-align:center;font-size:12px;padding-bottom:6px;border:none;">
            <b>Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam</b><br/>
            <u>Độc Lập - Tự Do - Hạnh Phúc</u>
          </td>
        </tr>
      </table>

      <div style="text-align:center;margin-bottom:8px;">
        <div style="font-size:15px;font-weight:bold;">ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG</div>
        <div style="font-size:12px;margin-top:3px;">
          ${chk(isSight)} TRẢ NGAY &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isSight)} TRẢ CHẬM &nbsp;&nbsp;&nbsp;&nbsp; ${chk(false)} UPAS
        </div>
      </div>

      <div style="font-size:11.5px;margin-bottom:6px;">
        <b>I. ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG CỦA KHÁCH HÀNG:</b><br/>
        <b>Kính gửi:</b> Ngân hàng TMCP Xuất Nhập khẩu Việt Nam - Chi nhánh: <b>${esc(bank.branch)}</b> (sau đây gọi là “Eximbank”)<br/>
        - Tên khách hàng: <b>${esc(lcData.applicantName)}</b> &nbsp;|&nbsp; Mã khách hàng (số CIF): <b>${esc(lcData.customerCif)}</b><br/>
        - Địa chỉ: ${esc(lcData.applicantAddress)}<br/>
        - Họ tên người đại diện khách hàng: <b>${esc(lcData.legalRepName)}</b> &nbsp;|&nbsp; Tài khoản tại Eximbank: <b>${esc(lcData.debitAccountNo)}</b><br/>
        <i>Với mọi trách nhiệm thuộc về phần mình, chúng tôi đề nghị Eximbank phát hành một Thư tín dụng không hủy ngang (irrevocable) với nội dung như sau:</i>
      </div>

      <div style="font-size:11.5px;line-height:1.45;padding:6px 8px;margin-bottom:8px;">
        <b>1) Advising Bank (name, address):</b> ${esc(lcData.advisingBankName)} &nbsp;|&nbsp; <b>Swift code:</b> <b>${esc(lcData.advisingBankBic)}</b><br/>
        <b>2) Type of L/C:</b> ${chk((lcData.form40A || '').includes('TRANSFERABLE'))} Transferable &nbsp; ${chk(isConfirm)} Confirmed &nbsp; ${chk(true)} Irrevocable<br/>
        <b>3) Expiry date:</b> <b>${esc(lcData.expiryDate)}</b> <b>and place:</b> ${chk(true)} at negotiating bank (${esc(lcData.expiryPlace)}) &nbsp; ${chk(false)} at issuing bank<br/>
        <b>4) Applicant (Full name and Address):</b> <b>${esc(lcData.applicantName)}</b> — ${esc(lcData.applicantAddress)}<br/>
        <b>5) Beneficiary (Full name and Address):</b> <b>${esc(lcData.beneficiaryName)}</b> — ${esc(lcData.beneficiaryAddress)}<br/>
        <b>6) Currency, Amount (figures):</b> <b>${esc(Engine.formatHumanAmount(lcData.amount, lcData.currency))}</b> &nbsp;|&nbsp; <b>Tolerance (if any):</b> +${esc(lcData.tolerancePlus)}% / -${esc(lcData.toleranceMinus)}%<br/>
        <b>7) The Credit available with:</b> ${chk(true)} Other bank: ${esc(lcData.advisingBankBic)} &nbsp; <b>By:</b> ${chk(availBy.includes('NEGOTIATION'))} Negotiation &nbsp; ${chk(availBy === 'BY PAYMENT')} Payment &nbsp; ${chk(availBy.includes('ACCEPTANCE'))} Acceptance &nbsp; ${chk(availBy.includes('DEF'))} Deferred payment<br/>
        <b>8) Draft at:</b> ${chk(isSight)} sight &nbsp; ${chk(!isSight)} ${!isSight ? esc(tenor) : '___ days after B/L date'} &nbsp; <b>For:</b> ${chk(true)} 100% invoice value<br/>
        <b>9) Drawee:</b> ${chk(true)} Eximbank &nbsp; ${chk(false)} Other bank<br/>
        <b>10) Latest date of shipment / Shipment period:</b> <b>${esc(lcData.latestShipmentDate)}</b><br/>
        <b>11) Partial shipment:</b> ${chk((lcData.partialShipment || '') === 'ALLOWED')} Allowed &nbsp; ${chk((lcData.partialShipment || '') !== 'ALLOWED')} Not Allowed &nbsp;|&nbsp;
        <b>12) Transhipment:</b> ${chk((lcData.transhipment || '') === 'ALLOWED')} Allowed &nbsp; ${chk((lcData.transhipment || '') !== 'ALLOWED')} Not Allowed<br/>
        <b>13) Shipping terms:</b> ${chk(inc === 'FOB')} FOB &nbsp; ${chk(inc === 'CIF')} CIF &nbsp; ${chk(inc === 'CFR')} CFR &nbsp; ${chk(!['FOB','CIF','CFR'].includes(inc))} Other: ${!['FOB','CIF','CFR'].includes(inc) ? esc(inc) : '___'} (Incoterms 2020) — Place: <b>${esc(lcData.portOfDischarge)}</b><br/>
        <b>14) Shipment:</b> Port of loading: <b>${esc(lcData.portOfLoading)}</b> &nbsp;|&nbsp; Port of discharge: <b>${esc(lcData.portOfDischarge)}</b><br/>
        <b>15) Description of goods:</b> ${esc(lcData.field45A)}<br/>
        <b>16) Documents required</b> <i>(Documents must be presented in triplicate in English unless otherwise stated)</i>:<br/>
        <div style="padding-left:14px;">
          1. ${chk(docs.hasInvoice)} Signed Commercial Invoice<br/>
          2. ${chk(docs.hasMarineBL)} 3/3 set originals of signed clean Shipped on board ocean Bill of Lading made out to order of <b>VIETNAM EXIMBANK</b>, marked ${chk(docs.isFreightPrepaid)} Freight prepaid ${chk(docs.isFreightCollect)} Freight to collect and notify the applicant.<br/>
          3. ${chk(docs.hasQualityCert)} Quality / Quantity certificate &nbsp;|&nbsp; 5. ${chk(docs.hasCO)} Certificate of origin &nbsp;|&nbsp; 6. ${chk(docs.hasPackingList)} Detailed packing list.<br/>
          7. ${chk(docs.hasInsurance)} Full set of originals of insurance policy/certificate for 110 percent of invoice value.<br/>
          <div style="white-space:pre-wrap;font-size:11px;color:#334155;">${esc(lcData.field46A)}</div>
        </div>
        <b>17) Additional conditions:</b> ${esc(lcData.field47A)}<br/>
        <b>18) Charges:</b> All banking charges outside Vietnam at Beneficiary's account.<br/>
        <b>19) Period for Presentation:</b> Documents must be presented within <b>${esc(lcData.field48)}</b> days after shipment date but within the validity of the credit.<br/>
        <b>20) Confirmation instruction:</b> ${chk(!isConfirm)} Without &nbsp; ${chk(isConfirm)} Confirm &nbsp; ${chk((lcData.field49 || '') === 'MAY ADD')} May add<br/>
        <b>21) Instructions to paying/accepting/negotiating bank:</b><br/>
        - USD66.- should be deducted from the proceeds for each set of documents bearing discrepancy(ies) presented under this L/C (USD110.- if L/C value &gt; 1 million USD).<br/>
        - Sanctions Clause: Eximbank undertakes no obligation to make payment if underlying transactions involve sanctioned countries, entities or vessels.
      </div>

      <div style="font-size:11px;text-align:justify;margin-bottom:8px;">
        <b>CAM KẾT CỦA NGƯỜI ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG:</b><br/>
        <b>1)</b> Chịu hoàn toàn trách nhiệm pháp lý về tính chính xác và hợp pháp của hợp đồng ngoại thương số <b>${esc(lcData.contractNo)}</b> ngày <b>${esc(lcData.contractDate)}</b>.<br/>
        <b>2)</b> Đảm bảo nguồn vốn: ${chk(fin.depositPercent > 0)} Ký quỹ Tỷ lệ: <b>${fin.depositPercent}%</b> (Số tiền: <b>${esc(Engine.formatHumanAmount(fin.depositAmountForeign, lcData.currency))}</b>) / ${chk(fin.creditLineUsedForeign > 0)} Sử dụng hạn mức tín dụng Eximbank (${esc(lcData.creditFacilityRef || '—')}).<br/>
        <b>3)</b> Cam kết thanh toán vô điều kiện; đồng ý ủy quyền Eximbank tự động trích nợ tài khoản hoặc nhận nợ vay bắt buộc với lãi suất 150% nếu không đủ số dư.<br/>
        <b>4)</b> Đề nghị Eximbank thông báo ngay nếu chứng từ bất hợp lệ; quá thời hạn <b>4 ngày làm việc</b> nếu chưa có ý kiến bằng văn bản, Eximbank được phép hoàn trả chứng từ.<br/>
        <b>5)-7)</b> Ủy quyền nhận bồi thường bảo hiểm và hoàn trả 1/3 B/L gốc nếu bị từ chối chứng từ.
      </div>

      <div class="signature-row" style="font-size:11.5px;">
        <div class="signature-box"><b>Kế toán Trưởng</b><br/><i>(Ký tên, ghi rõ họ tên)</i></div>
        <div class="signature-box"></div>
        <div class="signature-box"><i>..., ngày ... tháng ... năm ...</i><br/><b>Đại diện khách hàng (*)</b><br/><i>(Ký tên, ghi rõ họ tên, đóng dấu)</i><br/><br/><b>${esc(lcData.legalRepName)}</b></div>
      </div>
      <div style="border-top:1.5px solid #334155;padding-top:6px;margin-top:4px;font-size:11px;">
        <b>II. CHẤP THUẬN PHÁT HÀNH L/C CỦA NGÂN HÀNG TMCP XUẤT NHẬP KHẨU VIỆT NAM</b>
        <div style="display:flex;justify-content:space-around;margin-top:8px;font-weight:bold;">
          <span>TRUNG TÂM XỬ LÝ NGHIỆP VỤ BO</span>
          <span>GIÁM ĐỐC CHI NHÁNH</span>
        </div>
      </div>
      <div style="border-top:1px solid #94a3b8;margin-top:14px;padding-top:3px;display:flex;justify-content:space-between;font-size:10px;color:#475569;">
        <span>BM01-QĐ18/CL&amp;PTSP KHDN</span>
        <span>LBH: 01</span>
      </div>
    `;
  }

  /**
   * =========================================================================
   * MẪU 5: BIDV, VIETINBANK, ACB, MB BANK, SACOMBANK, NGÂN HÀNG KHÁC
   * =========================================================================
   */
  function renderBilingualStandardBank(lcData, fin, meta) {
    const bank = fin.bank;
    const docs = parseField46ACheckboxes(lcData.field46A, lcData);
    const inc = (lcData.incoterms || 'CIF').toUpperCase();
    const tenor = (lcData.draftTenor || 'AT SIGHT').toUpperCase();
    const isSight = tenor.includes('SIGHT');
    const isPartial = (lcData.partialShipment || '').toUpperCase() === 'ALLOWED';
    const isTrans = (lcData.transhipment || '').toUpperCase() === 'ALLOWED';
    const availBy = (lcData.availableBy || 'BY PAYMENT').toUpperCase();
    const isConfirm = (lcData.field49 || '').toUpperCase() === 'CONFIRM';
    const wordsAmt = amountToEnglishWords(lcData.amount, lcData.currency);

    const bankSpecificTitle = {
      BIDV: 'ĐƠN ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG KIÊM HỢP ĐỒNG CẤP TÍN DỤNG',
      VTB: 'GIẤY ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG NHẬP KHẨU',
      ACB: 'GIẤY ĐỀ NGHỊ PHÁT HÀNH TÍN DỤNG THƯ (DOCUMENTARY CREDIT)',
      MB: 'ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG KIÊM CAM KẾT BẢO ĐẢM',
      STB: 'GIẤY ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG',
      OTHER: 'ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG'
    }[bank.code] || 'ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG';

    const logoBlock = renderOfficialLogo(bank.code, 40, bank.code === 'OTHER' ? bank.name : meta.shortLabel.toUpperCase());

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div>${logoBlock}</div>
        <div style="border:1px solid #334155;padding:3px 10px;font-size:11px;font-weight:bold;">${esc(meta.formCode)}</div>
      </div>

      <div style="text-align:center;margin-bottom:6px;">
        <div style="font-size:14.5px;font-weight:bold;color:${meta.primary};">${esc(bankSpecificTitle)}</div>
        <div style="font-size:11.5px;font-style:italic;">APPLICATION FOR ISSUANCE OF IRREVOCABLE LETTER OF CREDIT</div>
        <div style="font-size:11.5px;margin-top:3px;">
          ${chk(isSight)} <b>TRẢ NGAY/AT SIGHT</b> &nbsp;&nbsp;&nbsp;&nbsp;
          ${chk(!isSight)} <b>TRẢ CHẬM/USANCE</b> &nbsp;&nbsp;&nbsp;&nbsp;
          ${chk(false)} <b>UPAS L/C</b>
        </div>
      </div>

      <div style="font-size:12px;margin-bottom:6px;">
        <b>Kính gửi/ <i>To:</i> ${esc(bank.name)} — ${esc(bank.branch)}</b> (SWIFT: ${esc(bank.bic)})<br/>
        <i>Với trách nhiệm thuộc về phần mình, chúng tôi đề nghị quý Ngân hàng phát hành thư tín dụng không huỷ ngang gồm các nội dung sau / With our responsibility, please issue an irrevocable letter of credit with details as follows:</i>
      </div>

      <table class="bank-table" style="font-size:11.5px;">
        <tr>
          <td style="width:45%;">
            ${chk((lcData.form40A || '').includes('TRANSFERABLE'))} Transferable &nbsp;&nbsp;&nbsp; ${chk(isConfirm)} Confirm<br/>
            ${chk((lcData.form40A || '').includes('STANDBY'))} Standby &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${chk(true)} Irrevocable<br/>
            <b>Expiry date:</b> <b>${esc(lcData.expiryDate)}</b><br/>
            <b>Expiry place:</b> ${esc(lcData.expiryPlace)}
          </td>
          <td style="width:55%;">
            <b>Advising bank</b> <i>(Name and Address / Swift code):</i><br/>
            ${esc(lcData.advisingBankName)}<br/>
            SWIFT BIC: <b>${esc(lcData.advisingBankBic)}</b>
          </td>
        </tr>
        <tr>
          <td>
            <b>Applicant</b> <i>(Name and Address):</i><br/>
            <b>${esc(lcData.applicantName)}</b><br/>
            ${esc(lcData.applicantAddress)}<br/>
            CIF: <b>${esc(lcData.customerCif)}</b> | MST: <b>${esc(lcData.applicantTaxId || '0312456789')}</b>
          </td>
          <td>
            <b>Beneficiary</b> <i>(Name and Address):</i><br/>
            <b>${esc(lcData.beneficiaryName)}</b><br/>
            ${esc(lcData.beneficiaryAddress)}<br/>
            Account No.: ...............................
          </td>
        </tr>
        <tr>
          <td>
            <b>Currency code &amp; Amount</b><br/>
            In figures: <b>${esc(Engine.formatHumanAmount(lcData.amount, lcData.currency))}</b><br/>
            In words: <i>${esc(wordsAmt)}</i>
          </td>
          <td>
            <b>Credit available with:</b><br/>
            ${chk(false)} Any Bank &nbsp; ${chk(true)} Advising Bank &nbsp; ${chk(isConfirm)} Confirming Bank<br/>
            ${chk(availBy.includes('NEGOTIATION'))} By negotiation &nbsp; ${chk(availBy === 'BY PAYMENT')} By payment &nbsp; ${chk(availBy.includes('ACCEPTANCE'))} By acceptance &nbsp; ${chk(availBy.includes('DEF'))} By deferred payment<br/>
            <b>Draft(s) at</b> ${chk(isSight)} sight &nbsp; ${chk(!isSight)} ${!isSight ? esc(tenor) : '___ days after B/L date'} <b>For 100% of Invoice value</b>
          </td>
        </tr>
        <tr>
          <td><b>Tolerance (if any):</b> +${esc(lcData.tolerancePlus)}% / -${esc(lcData.toleranceMinus)}%</td>
          <td>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="border:none;width:50%;"><b>Partial shipment:</b><br/>${chk(isPartial)} allowed &nbsp; ${chk(!isPartial)} not allowed</td>
                <td style="border:none;width:50%;"><b>Transshipment:</b><br/>${chk(isTrans)} allowed &nbsp; ${chk(!isTrans)} not allowed</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td>
            <b>Place of receipt:</b> ${esc(lcData.portOfLoading)}<br/>
            <b>Port of loading:</b> <b>${esc(lcData.portOfLoading)}</b>
          </td>
          <td>
            <b>Port of discharge:</b> <b>${esc(lcData.portOfDischarge)}</b><br/>
            <b>Latest shipment date:</b> <b>${esc(lcData.latestShipmentDate)}</b>
          </td>
        </tr>
        <tr>
          <td colspan="2">
            <b>Description of goods/services:</b>
            <div style="white-space:pre-wrap;margin-top:2px;">${esc(lcData.field45A)}</div>
            <div style="margin-top:4px;border-top:1px dashed #cbd5e1;padding-top:3px;">
              <b>Trade terms:</b> ${chk(inc === 'FOB')} FOB &nbsp; ${chk(inc === 'CIF')} CIF &nbsp; ${chk(inc === 'CFR')} CFR &nbsp; ${chk(inc === 'CIP')} CIP &nbsp; ${chk(inc === 'CPT')} CPT &nbsp; ${chk(!['FOB','CIF','CFR','CIP','CPT'].includes(inc))} Other: ${!['FOB','CIF','CFR','CIP','CPT'].includes(inc) ? esc(inc) : '___'} &nbsp;|&nbsp;
              <b>As per Incoterms:</b> ${chk(true)} 2020 &nbsp; <b>Place:</b> ${esc(lcData.portOfDischarge)}
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="2">
            <b>Documents required:</b> <i>All documents must be made in English:</i><br/>
            1. ${chk(docs.hasInvoice)} Signed Commercial Invoice issued by Beneficiary in 03 original(s) and 03 copy(ies)<br/>
            2. ${chk(docs.hasMarineBL)} <b>For Shipment by sea:</b> Full (3/3) set of original clean shipped on board Ocean Bill of Lading made out to order of <b>${esc(bank.englishName)}</b>, marked ${chk(docs.isFreightPrepaid)} Freight prepaid ${chk(docs.isFreightCollect)} Freight collect and notify the Applicant with full address.<br/>
            3. ${chk(docs.hasPackingList)} Detailed Packing List in 03 original(s) and 03 copy(ies)<br/>
            4. ${chk(docs.hasInsurance)} Full set of Insurance Policy/Certificate covering ${chk(true)} Institute Cargo Clause A for 110% of Invoice value, blank endorsed, claims payable in Vietnam in currency of credit.<br/>
            5. ${chk(docs.hasCO)} Certificate of Origin in 01 original(s) and 02 copy(ies) &nbsp;|&nbsp; 6. ${chk(docs.hasQualityCert)} Quantity and Quality Certificate<br/>
            8. ${chk(docs.hasBenCert)} Beneficiary's certificate certifying that one set of non-negotiable shipping documents have been sent directly to Applicant within ${esc(docs.benCertDays)} days after shipment date.<br/>
            <div style="white-space:pre-wrap;font-size:11px;color:#334155;margin-top:2px;">${esc(lcData.field46A)}</div>
          </td>
        </tr>
        <tr>
          <td colspan="2">
            <b>Additional conditions:</b><br/>
            ${chk(true)} All required documents must indicate our L/C number &nbsp;&nbsp; ${chk(true)} Documents must be issued in English<br/>
            <div style="white-space:pre-wrap;font-size:11px;">${esc(lcData.field47A)}</div>
          </td>
        </tr>
        <tr>
          <td colspan="2"><b>T.T Reimbursement:</b> ${chk(false)} Allowed &nbsp;&nbsp;&nbsp; ${chk(true)} Not allowed</td>
        </tr>
        <tr>
          <td colspan="2"><b>Charges:</b> ${chk(true)} All banking charges outside Vietnam and remittance cable charges for account of Beneficiary (${esc(lcData.field71D)})</td>
        </tr>
        <tr>
          <td colspan="2"><b>Documents to be presented:</b> ${chk(true)} Within <b>${esc(lcData.field48)}</b> days after shipment date but within the L/C validity.</td>
        </tr>
        <tr>
          <td colspan="2">
            <b>Confirmation instruction:</b> ${chk(isConfirm)} Confirm &nbsp; ${chk((lcData.field49 || '') === 'MAY ADD')} May add &nbsp; ${chk(!isConfirm && (lcData.field49 || '') !== 'MAY ADD')} Without<br/>
            <i>This Letter of Credit subjects to UCP latest version and ISBP latest version, ICC publication.</i>
          </td>
        </tr>
      </table>

      <div style="border:1px solid #334155;padding:7px 9px;font-size:11px;text-align:justify;margin-bottom:8px;">
        <b>CAM KẾT CỦA ĐƠN VỊ ĐỀ NGHỊ PHÁT HÀNH THƯ TÍN DỤNG:</b><br/>
        <b>1.</b> Hàng hóa nhập khẩu không thuộc danh mục cấm nhập khẩu; chịu trách nhiệm pháp lý về giấy phép và hạn ngạch nhập khẩu.<br/>
        <b>2.</b> Chấp nhận thanh toán vô điều kiện khi Bộ chứng từ phù hợp; ủy quyền cho <b>${esc(meta.shortLabel)}</b> tự động trích tiền từ tài khoản số <b>${esc(lcData.debitAccountNo)}</b> để thanh toán, nếu không đủ số dư xin nhận nợ vay bắt buộc theo lãi phạt quy định và lô hàng nhập khẩu đương nhiên trở thành tài sản cầm cố cho Ngân hàng.<br/>
        <b>3.</b> Đề nghị Ngân hàng tự động trích tài khoản để ký quỹ <b>${fin.depositPercent}%</b> = <b>${esc(Engine.formatHumanAmount(fin.depositAmountForeign, lcData.currency))}</b> (Hạn mức tín dụng sử dụng: <b>${esc(Engine.formatHumanAmount(fin.creditLineUsedForeign, lcData.currency))}</b> — HĐ: ${esc(lcData.creditFacilityRef || '—')}).<br/>
        <b>4-7.</b> Tự mua bảo hiểm nếu điều kiện mua chưa gồm bảo hiểm; nộp Tờ khai Hải quan sau thông quan; không viện dẫn tranh chấp để từ chối thanh toán; tuân thủ quản lý ngoại hối và quy định cấm vận.<br/>
        <b>8.</b> Thư tín dụng này được mở theo: ${chk(true)} Hợp đồng ngoại thương số: <b>${esc(lcData.contractNo)}</b> ngày <b>${esc(lcData.contractDate)}</b>.<br/>
        <b>9.</b> Trường hợp nhận 1/3 B/L gốc nhưng bộ chứng từ bất hợp lệ bị từ chối thanh toán, cam kết hoàn trả lại đầy đủ 1/3 B/L gốc cho Ngân hàng.
      </div>

      <div class="signature-row" style="font-size:11.5px;">
        <div class="signature-box"><b>Kế toán trưởng</b><br/><i>(nếu có — Ký, ghi rõ họ tên)</i></div>
        <div class="signature-box"><i>Ngày ${esc(fmtDdMmYyyy(lcData.issueDate))}</i><br/><b>Dấu và chữ ký của chủ tài khoản</b><br/><br/><br/><b>${esc(lcData.legalRepName)}</b></div>
        <div class="signature-box"><b>PHẦN DÀNH CHO ${esc(meta.shortLabel.toUpperCase())}</b><br/><i>Kiểm tra hồ sơ &amp; Duyệt phát hành MT700</i></div>
      </div>
    `;
  }

  function renderBankApplicationHtml(lcData, fin, options) {
    const code = (lcData.issuingBankCode || 'VCB').toUpperCase();
    const meta = BANK_META[code] || BANK_META.OTHER;

    if (code === 'VCB') return renderVCB(lcData, fin);
    if (code === 'VPB') return renderVPB(lcData, fin);
    if (code === 'TCB') return renderTCB(lcData, fin);
    if (code === 'EIB') return renderEIB(lcData, fin);
    return renderBilingualStandardBank(lcData, fin, meta);
  }

  function buildWordDocumentHtml(lcData, fin) {
    const innerHtml = renderBankApplicationHtml(lcData, fin, { isWordMode: true });
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>Don De Nghi Mo LC - ${esc(lcData.lcNumber)}</title>
<style>
  @page { size: A4; margin: 1.2cm 1.2cm 1.2cm 1.2cm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.3; color: #000000; }
  .bank-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .bank-table th, .bank-table td { border: 1px solid #334155; padding: 4px 6px; vertical-align: top; text-align: left; font-size: 10pt; }
  .signature-row { display: table; width: 100%; margin-top: 14px; text-align: center; }
  .signature-box { display: table-cell; width: 33.3%; vertical-align: top; height: 90px; font-size: 10pt; }
</style>
</head>
<body>
${innerHtml}
</body>
</html>`;
  }

  return {
    BANK_META,
    amountToEnglishWords,
    parseField46ACheckboxes,
    renderOfficialLogo,
    renderBankApplicationHtml,
    buildWordDocumentHtml
  };
});
