'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Parser = require('./public/js/docx-pdf-parser.js');
const Engine = require('./public/js/ucp600-engine.js');

async function runTests() {
  console.log('--- Bắt đầu kiểm thử TradeFin Import L/C Simulator ---');

  // 1. Kiểm tra đọc file .docx thật từ sample_files
  const contractDocxPath = path.join(__dirname, 'sample_files/contracts/Sales_Contract_CIF_Machinery_Japan.docx');
  assert(fs.existsSync(contractDocxPath), 'File mẫu Sales_Contract_CIF_Machinery_Japan.docx phải tồn tại');
  const buf = fs.readFileSync(contractDocxPath);
  const rawText = await Parser.readFileToText({
    name: 'Sales_Contract_CIF_Machinery_Japan.docx',
    arrayBuffer: async () => buf
  });
  assert(rawText.includes('SC-2026-VNJP-088'), 'Nội dung trích xuất từ .docx phải chứa số hợp đồng SC-2026-VNJP-088');
  console.log('[PASS] 1. Giải nén và đọc file .docx thật chuẩn OpenXML');

  // 2. Kiểm tra Auto-fill Hợp đồng CIF Nhật Bản
  const parsed = Parser.parseSalesContractText(rawText);
  const ex = parsed.extracted;
  assert.strictEqual(ex.contractNo, 'SC-2026-VNJP-088');
  assert.strictEqual(ex.currency, 'USD');
  assert.strictEqual(Number(ex.amount), 125000);
  assert.strictEqual(ex.incoterms, 'CIF');
  assert.strictEqual(ex.latestShipmentDate, '2026-12-15');
  assert.strictEqual(ex.advisingBankBic, 'SMBCJPJTXXX');
  assert(ex.applicantName.includes('VIETNAM PRECISION MECHANICS'), 'Phải nhận diện đúng Applicant');
  assert(ex.beneficiaryName.includes('OSAKA CNC ENGINEERING'), 'Phải nhận diện đúng Beneficiary');

  // Kiểm tra bóc tách từ văn bản OCR ghép 2 trang Bản in FIN 700
  const fin700OcrSample = `
20: Documentary Credit Number
    TF-24220-12839I
31C: Date of Issue
    04/15/2024
50: Applicant
    CTY TNHH DVTM TRUONG GIANG
    51 DUONG SO 7 P.10 Q.TAN BINH HOCHIMINH VIETNAM
59: Beneficiary - Name & Address
    BAHRU STAINLESS SDN BHD.
    Ptd 4069, Johor, Malaysia
32B: Currency Code, Amount
    Currency: USD
    Amount : 42,000.00
39A: Percentage Credit Amt Tolerance
    10 / 10
44E: Port of Loading/Airport of Dep.
    Any port in Malaysia
44F: Port of Dischrge/Airport of Dest
    Tan Cang port in Hochiminh City, Viet Nam
44C: Latest Date of Shipment
    06/30/2024
45A: Description of Goods/Services
    bull; Commodity name: COLD ROLLED, STAINLESS STEEL COILS
    bull; Trade terms: CFR Cat lai port in Hochiminh city, Vietnam
`;
  const parsedFin = Parser.parseSalesContractText(fin700OcrSample).extracted;
  assert.strictEqual(parsedFin.contractNo, 'TF-24220-12839I');
  assert.strictEqual(parsedFin.contractDate, '2024-04-15');
  assert.strictEqual(Number(parsedFin.amount), 42000);
  assert.strictEqual(parsedFin.tolerancePlus, '10');
  assert.strictEqual(parsedFin.incoterms, 'CFR');
  assert.strictEqual(parsedFin.latestShipmentDate, '2024-06-30');
  // Kiểm tra bóc tách Hợp đồng thực tế cấu trúc BETWEEN/AND, EX-WORK, DESTINATION PORT, END OF MAY
  const mtuContractSample = `
TRUNG TAM LOGISTICS XNK QUOC TE
SALES CONTRACT
NO : 46-16/HTCL-MTU
DATE : MAY 03th, 2020

BETWEEN
MTU ASIA PTE LTD
10 TUKANG INNOVATION DRIVE, SINGAPORE 618302.
BANKER: DEUTSCHE BANK AG, SINGAPORE BRANCH
HEREINAFTER CALLED "THE SELLER".

AND
THUAN PHAT IMPORT EXPORT SERVICE CO. LTD
E6 ROAD 19, KP2, BINH AN WARD, DISTRICT 2, HO CHI MINH CITY, VIET NAM
BANKER: VIETCOMBANK - CN NAM SAI GON, TPHCM
SWIFT CODE: BFTVVNVX018
HEREINAFTER CALLED "THE BUYER".

1. COMMODITY- SPECIFICATION-QUANTITY-PRICE:
DESCRIPTION: MTU DIESEL ENGINES AND STANDARD SPARE PARTS.
TOTAL IN EUR : 48,410
THESE PRICES ARE UNDERSTOOD EX-WORK MTU ASIA PTE LTD IN SINGAPORE, INCOTERMS 2010 TO BE REFERRED.

2. SHIPMENT:
2.1. PARTIAL SHIPMENT : NOT ALLOWED.
2.2. TRANSHIPMENT : ALLOWED.
2.3. TIME OF SHIPMENT : END OF MAY, 2020
2.4. LOADING PORT : ANY PORT IN SINGAPORE.
2.5. DESTINATION PORT : ANY PORT IN VIETNAM.

4. PAYMENT: 100% INVOICE VALUE BY AN IRREVOCABLE LETTER OF CREDIT AT SIGHT IN FAVOR OF MTU ASIA PTE LTD.
BANKER : DEUTSCHE BANK AG, SINGAPORE BRANCH
SWIFT CODE: DEUTSGSGXXX
`;
  const parsedMtu = Parser.parseSalesContractText(mtuContractSample).extracted;
  assert.strictEqual(parsedMtu.contractNo, '46-16/HTCL-MTU');
  assert.strictEqual(parsedMtu.contractDate, '2020-05-03');
  assert.strictEqual(parsedMtu.applicantName, 'THUAN PHAT IMPORT EXPORT SERVICE CO. LTD');
  assert.strictEqual(parsedMtu.beneficiaryName, 'MTU ASIA PTE LTD');
  assert.strictEqual(parsedMtu.currency, 'EUR');
  assert.strictEqual(parsedMtu.amount, '48410');
  assert.strictEqual(parsedMtu.incoterms, 'EXW');
  assert.strictEqual(parsedMtu.portOfLoading, 'ANY PORT IN SINGAPORE');
  assert.strictEqual(parsedMtu.portOfDischarge, 'ANY PORT IN VIETNAM');
  assert.strictEqual(parsedMtu.latestShipmentDate, '2020-05-31');
  assert.strictEqual(parsedMtu.advisingBankBic, 'DEUTSGSGXXX');
  console.log('[PASS] 2. Bộ bóc tách Hợp đồng Ngoại thương & OCR Bản in FIN 700 -> Dữ liệu MT700 chính xác');

  // 3. Kiểm tra sinh điều khoản mặc định và xác thực UCP 600
  const lcData = Object.assign({}, ex, {
    issuingBankCode: 'VCB',
    lcNumber: 'LC2026VCB0088',
    issueDate: '2026-11-14',
    expiryDate: '2026-12-29',
    expiryPlace: 'AT BENEFICIARY COUNTRY',
    form40A: 'IRREVOCABLE',
    draweeBic: 'BFTVVNVXXXX',
    depositPercent: 100
  });
  const clauses = Engine.buildDefaultMT700Clauses(lcData);
  Object.assign(lcData, clauses);

  const valOk = Engine.validateLCApplication(lcData, ex);
  assert.strictEqual(valOk.summary.errors, 0, 'Hồ sơ chuẩn CIF phải có 0 lỗi nghiêm trọng');

  // Cố tình tạo lỗi UCP 600: mua CIF nhưng bỏ chứng từ bảo hiểm khỏi 46A và đặt 44C > 31D
  const badLc = Object.assign({}, lcData, {
    field46A: '+ SIGNED COMMERCIAL INVOICE.\n+ FULL SET B/L MARKED FREIGHT COLLECT.',
    expiryDate: '2026-12-10'
  });
  const valBad = Engine.validateLCApplication(badLc, ex);
  assert(valBad.summary.errors >= 3, 'Phải bắt được ít nhất 3 lỗi (thiếu bảo hiểm CIF, Freight Collect trên CIF, hết hạn trước ngày giao hàng)');
  console.log('[PASS] 3. Bộ kiểm tra rủi ro & tuân thủ UCP 600 / Incoterms 2020 hoạt động chính xác');

  // 4. Kiểm tra xuất bức điện MT700 (Điện thô & Bản in giấy FIN 700) & Tu chỉnh MT707
  const mt700 = Engine.generateSwiftMT700(lcData);
  assert(mt700.includes(':20:LC2026VCB0088'));
  assert(mt700.includes(':31C:261114'));
  assert(mt700.includes(':32B:USD125000,00'));
  assert(mt700.includes(':40E:UCP LATEST VERSION'));

  const printedMt700 = Engine.generateSwiftPrintedMT700(lcData);
  assert(printedMt700.includes('ORIGINAL'));
  assert(printedMt700.includes('Reference Number   LC2026VCB0088'));
  assert(printedMt700.includes('Print No   1'));
  assert(/MT ID\s*:\s*LCD\d{9}\s+Priority : N/.test(printedMt700));
  assert(printedMt700.includes('Sender Bank   : BFTVVNVX018'));
  assert(printedMt700.includes('Input Message : MT700         LC Full SWIFT'));
  assert(printedMt700.includes('Sent To       : SMBCJPJT'));
  assert(/MUR\s*:\s*LCD\d{9}VCBUSER\d{2}/.test(printedMt700));
  assert(printedMt700.includes('--------------------------- Message Header ---------------------------'));
  assert(printedMt700.includes('FIN 700 Issue of a Documentary Credit'));
  assert(printedMt700.includes('--------------------------- Message Text -----------------------------'));
  assert(printedMt700.includes('27: Sequence of Total'));
  assert(printedMt700.includes('32B: Currency Code, Amount'));
  assert(printedMt700.includes('72: Sender to Receiver Information'));
  assert(printedMt700.includes('PLEASE ACKNOWLEDGE YOUR RECEIPT OF THIS L/C BY MT730.'));
  assert(printedMt700.includes('--------------------------- Message End-------------------------------'));

  const amendRes = Engine.generateSwiftMT707(lcData, {
    amendmentNumber: 1,
    amendmentDate: '2026-11-20',
    newLatestShipmentDate: '2026-12-20',
    newExpiryDate: '2027-01-04',
    newAmount: '130000'
  });
  assert(amendRes.mt707Text.includes(':32B:USD5000,00'));
  assert(amendRes.mt707Text.includes(':34B:USD130000,00'));
  assert(amendRes.mt707Text.includes(':44C:261220'));
  assert.strictEqual(amendRes.effectiveLC.latestShipmentDate, '2026-12-20');
  console.log('[PASS] 4. Xuất bức điện chuẩn SWIFT MT700 và Tu chỉnh MT707 chính xác');

  // 5. Kiểm tra Bộ chứng từ hàng về CÓ LỖI (4 bất hợp lệ) vs HỢP LỆ (0 lỗi)
  async function loadDocsFromFolder(folder) {
    const readDoc = async (file, type) => {
      const b = fs.readFileSync(path.join(__dirname, 'sample_files', folder, file));
      const t = await Parser.readFileToText({ name: file, arrayBuffer: async () => b });
      return Parser.parseShippingDocText(t, type);
    };
    return {
      presentationDate: '2026-12-20',
      invoice: await readDoc('01_Commercial_Invoice.docx', 'invoice'),
      billOfLading: await readDoc('02_Bill_of_Lading.docx', 'billOfLading'),
      packingList: await readDoc('03_Packing_List.docx', 'packingList'),
      draft: await readDoc('04_Bill_of_Exchange.docx', 'draft'),
      certificateOfOrigin: await readDoc('05_Certificate_of_Origin.docx', 'certificateOfOrigin'),
      insurance: await readDoc('06_Insurance_Policy.docx', 'insurance')
    };
  }

  const discDocs = await loadDocsFromFolder('shipping_docs_discrepant');
  const discRes = Engine.checkDocumentDiscrepancies(lcData, discDocs);
  assert.strictEqual(discRes.isClean, false);
  const discCodes = discRes.discrepancies.map(d => d.code);
  assert(discCodes.includes('LATE_SHIPMENT'), 'Phải bắt được lỗi giao hàng trễ (17/12 > 15/12)');
  assert(discCodes.includes('INSUFFICIENT_INSURANCE_AMOUNT'), 'Phải bắt được lỗi bảo hiểm thiếu 110% (130k < 137.5k)');
  assert(discCodes.includes('INSURANCE_DATED_AFTER_SHIPMENT'), 'Phải bắt được lỗi ngày bảo hiểm sau ngày On Board (19/12 > 17/12)');
  assert(discCodes.includes('GROSS_WEIGHT_INCONSISTENCY'), 'Phải bắt được lỗi lệch Gross Weight (Packing List 18,920kg vs B/L 18,450kg)');
  assert(discRes.mt734Notice.includes(':77J:'), 'Phải xuất điện thông báo từ chối MT734');
  console.log(`[PASS] 5. Bộ đối chiếu chứng từ bắt chuẩn xác ${discRes.discrepancies.length} lỗi bất hợp lệ trên bộ hồ sơ Discrepant`);

  const cleanDocs = await loadDocsFromFolder('shipping_docs_clean');
  const cleanRes = Engine.checkDocumentDiscrepancies(lcData, cleanDocs);
  assert.strictEqual(cleanRes.isClean, true, 'Bộ hồ sơ Clean phải trả về isClean = true, không có lỗi');
  console.log('[PASS] 6. Bộ đối chiếu chứng từ xác nhận 0 lỗi cho bộ hồ sơ Clean Presentation');

  // 7. Kiểm tra mẫu Đơn đề nghị mở L/C theo biểu mẫu thực tế của 9 ngân hàng + Ngân hàng khác + xuất Word + Logo chính thức
  const BankLogos = require('./public/js/bank-logos.js');
  const requiredLogoCodes = ['VCB', 'BIDV', 'VTB', 'TCB', 'ACB', 'MB', 'VPB', 'EIB', 'STB'];
  for (const code of requiredLogoCodes) {
    assert(BankLogos[code] && BankLogos[code].startsWith('data:image/'), `Logo Data URI của ${code} phải tồn tại và hợp lệ`);
  }
  const BankTemplates = require('./public/js/bank-templates.js');
  const expectedBanks = [
    { code: 'VCB', markers: ['Phụ lục số 16', 'YÊU CẦU PHÁT HÀNH THƯ TÍN DỤNG', '(13) Document required', 'Cam kết của bên yêu cầu mở LC', 'UNITED STATES DOLLARS ONE HUNDRED TWENTY-FIVE THOUSAND ONLY'] },
    { code: 'VPB', markers: ['MB01.HDM-TM.N/A.N/A/01', 'F31D:', 'F46A:', 'IV. CAM KẾT CỦA BÊN YÊU CẦU PHÁT HÀNH L/C'] },
    { code: 'TCB', markers: ['MB01-QT.TTTM/TCB', '21/2024/TT-NHNN', 'Phần dành cho ngân hàng / Bank only'] },
    { code: 'EIB', markers: ['BM01-QĐ18/CL&amp;PTSP KHDN', 'USD66.-', 'TRUNG TÂM XỬ LÝ NGHIỆP VỤ BO'] },
    { code: 'BIDV', markers: ['Mẫu TTQT-01/BIDV', 'In figures:', 'In words:'] },
    { code: 'VTB', markers: ['Mẫu 01/LC-NK-VTB', 'In figures:', 'In words:'] },
    { code: 'ACB', markers: ['Mẫu ACB-TTQT-01/LC', 'In figures:', 'In words:'] },
    { code: 'MB', markers: ['Mẫu MB-TF-LC01', 'In figures:', 'In words:'] },
    { code: 'STB', markers: ['Mẫu STB-TTQT-01', 'In figures:', 'In words:'] },
    { code: 'OTHER', markers: ['NGÂN HÀNG MSB TEST', 'In figures:', 'In words:'] }
  ];
  for (const b of expectedBanks) {
    const testLc = Object.assign({}, lcData, {
      issuingBankCode: b.code,
      customBankName: 'NGÂN HÀNG MSB TEST',
      customBankBic: 'MCOBVNVXXXX',
      customBankBranch: 'CN SÀI GÒN',
      customBankAddress: '123 Nguyễn Huệ, Q1, TP.HCM'
    });
    const fin = Engine.calculateFinancials(testLc);
    const html = BankTemplates.renderBankApplicationHtml(testLc, fin, { isWordMode: false });
    for (const m of b.markers) {
      assert(html.includes(m), `Mẫu của ${b.code} phải chứa "${m}"`);
    }
    const wordHtml = BankTemplates.buildWordDocumentHtml(testLc, fin);
    assert(wordHtml.includes('urn:schemas-microsoft-com:office:word') && wordHtml.includes(b.markers[0]), `File Word của ${b.code} phải hợp lệ`);
    if (b.code !== 'OTHER') {
      assert(html.includes('<img src="data:image/'), `Bản xem HTML của ${b.code} phải nhúng logo thật <img src="data:image/...">`);
      assert(wordHtml.includes('<img src="data:image/'), `File Word của ${b.code} phải nhúng logo thật <img src="data:image/...">`);
    }
  }
  console.log('[PASS] 7. Xuất Đơn đề nghị mở L/C theo biểu mẫu thực tế của 9 Ngân hàng + Ngân hàng khác (HTML, Word .doc & Logo chính thức) đạt chuẩn');

  console.log('=== TẤT CẢ CÁC BÀI KIỂM THỬ ĐỀU ĐẠT 100% ===');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
