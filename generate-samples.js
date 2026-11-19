'use strict';

/**
 * Script tạo 3 Hợp đồng Ngoại thương chuẩn thực tế theo yêu cầu:
 * 1. Mẫu 1 (Chuẩn cơ bản): Máy CNC Nhật Bản (Osaka -> Cát Lái), CIF, At Sight.
 * 2. Mẫu 2 (Trả chậm & Giao từng phần): Nguyên phụ liệu từ Trung Quốc (Shanghai -> Hải Phòng), FOB, Usance 60 days after B/L date, Giao từng phần ALLOWED.
 * 3. Mẫu 3 (Tình huống bẫy nghiệp vụ): Thiết bị điện tử EXW Tokyo nhưng cài điều khoản B/L vận tải biển và ngày hết hạn L/C trùng ngày giao hàng muộn nhất.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const rawBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const compBuf = zlib.deflateRawSync(rawBuf);
    const crc = crc32(rawBuf);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compBuf.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, compBuf);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + compBuf.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

function createDocxBuffer(textContent) {
  const paragraphs = String(textContent)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => {
      const trimmed = line.trimEnd();
      const isHeading = /^(SALES CONTRACT|COMMERCIAL INVOICE|BILL OF LADING|PACKING LIST|BILL OF EXCHANGE|CERTIFICATE OF ORIGIN|MARINE INSURANCE|ARTICLE\s+\d)/i.test(trimmed);
      const rPr = isHeading ? '<w:rPr><w:b/><w:sz w:val="24"/></w:rPr>' : '<w:rPr><w:sz w:val="22"/></w:rPr>';
      return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(trimmed)}</w:t></w:r></w:p>`;
    })
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr/>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return buildZipBuffer([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: relsXml },
    { name: 'word/document.xml', data: documentXml }
  ]);
}

function writeSampleFile(relPath, content) {
  const fullPath = path.join(__dirname, 'sample_files', relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  if (relPath.endsWith('.docx')) {
    fs.writeFileSync(fullPath, createDocxBuffer(content));
  } else {
    fs.writeFileSync(fullPath, content, 'utf8');
  }
}

// MẪU 1: CHUẨN CƠ BẢN (CIF OSAKA -> CÁT LÁI, AT SIGHT)
const CONTRACT_1_CIF_JAPAN = `SALES CONTRACT / HỢP ĐỒNG MUA BÁN NGOẠI THƯƠNG
Sales Contract No.: SC-2026-VNJP-088
Contract Date: 14 November 2026

THE BUYER (APPLICANT / BÊN MUA):
VIETNAM PRECISION MECHANICS JOINT STOCK COMPANY
Address: Lot C2, Hiep Phuoc Industrial Park, Nha Be District, Ho Chi Minh City, Vietnam
Tel: +84 28 3873 9988

THE SELLER (BENEFICIARY / BÊN BÁN):
OSAKA CNC ENGINEERING CORPORATION
Address: 3-14-22 Nishi-Honmachi, Nishi-ku, Osaka 550-0005, Japan
Tel: +81 6 6532 4410

ARTICLE 1: COMMODITY, QUANTITY AND PRICE (HÀNG HÓA, SỐ LƯỢNG VÀ ĐƠN GIÁ)
Description of Goods: 5-AXIS CNC VERTICAL MACHINING CENTER, MODEL VMC-850PRO, BRAND: OSAKA-TECH, NEW 100%, YEAR OF MANUFACTURE 2026, HS CODE 8457.10.00
Quantity: 02 SETS
Unit Price: USD 62,500.00 / SET
Total Contract Value: USD 125,000.00 (SAY: UNITED STATES DOLLARS ONE HUNDRED TWENTY FIVE THOUSAND ONLY)
Delivery Terms: CIF CAT LAI PORT, HO CHI MINH CITY, VIETNAM (INCOTERMS 2020)
Tolerance: +/- 0%

ARTICLE 2: SHIPMENT TERMS (ĐIỀU KIỆN GIAO HÀNG)
Port of Loading: OSAKA PORT, JAPAN
Port of Discharge: CAT LAI PORT, HO CHI MINH CITY, VIETNAM
Latest Shipment Date: 15 December 2026
Partial Shipments: NOT ALLOWED
Transhipment: ALLOWED

ARTICLE 3: PAYMENT TERMS (PHƯƠNG THỨC THANH TOÁN)
Payment shall be made 100% by an Irrevocable Documentary Letter of Credit (L/C) At Sight in USD, subject to UCP 600 (latest revision), opened through a first-class commercial bank in Vietnam in favor of Seller.
Advising Bank: SUMITOMO MITSUI BANKING CORPORATION, OSAKA BRANCH
SWIFT BIC: SMBCJPJTXXX

ARTICLE 4: DOCUMENTS REQUIRED FOR L/C PRESENTATION (CHỨNG TỪ XUẤT TRÌNH)
1. Signed Commercial Invoice in 03 originals indicating Contract No. and L/C No.
2. Full set (3/3) of Original Clean Shipped on Board Marine Bill of Lading made out to the order of Issuing Bank, marked "Freight Prepaid" and notify Applicant.
3. Detailed Packing List in 03 originals.
4. Certificate of Origin Form JV (Japan-Vietnam EPA) issued by Japan Chamber of Commerce and Industry.
5. Marine Insurance Policy/Certificate for at least 110% of Invoice Value covering Institute Cargo Clauses (A), War & Strikes Clauses.
6. Manufacturer's Certificate of Quality and Quantity.

Presentation Period: Documents must be presented within 14 days after B/L shipment date.
`;

// MẪU 2: TRẢ CHẬM & GIAO TỪNG PHẦN (FOB SHANGHAI -> HẢI PHÒNG, USANCE 60 DAYS)
const CONTRACT_2_FOB_CHINA_USANCE = `SALES CONTRACT / HỢP ĐỒNG NGOẠI THƯƠNG
Sales Contract No.: CN-VN-2026-FOB60
Contract Date: 12 November 2026

THE BUYER (APPLICANT / BÊN MUA):
HAI PHONG TEXTILE & GARMENT CORPORATION
Address: 128 Le Hong Phong Street, Ngo Quyen District, Hai Phong City, Vietnam
Tel: +84 225 382 9911

THE SELLER (BENEFICIARY / BÊN BÁN):
SHANGHAI TEXTILE RAW MATERIALS CO., LTD
Address: 888 Zhongshan East Road, Huangpu District, Shanghai 200002, China
Tel: +86 21 6321 8899

ARTICLE 1: COMMODITY, QUANTITY AND CONTRACT VALUE
Description of Goods: 100% POLYESTER SPUN YARN 30S/1, RAW WHITE ON CONES, SUITABLE FOR KNITTING AND WEAVING
Quantity: 100 MT (4,000 CARTONS)
Unit Price: USD 1,800.00 / MT
Total Contract Value: USD 180,000.00
Delivery Terms: FOB SHANGHAI PORT, CHINA (INCOTERMS 2020)
Tolerance: +/- 5% in quantity and amount

ARTICLE 2: SHIPMENT TERMS
Port of Loading: SHANGHAI PORT, CHINA
Port of Discharge: HAI PHONG PORT, VIETNAM
Latest Shipment Date: 25 December 2026
Partial Shipments: ALLOWED (CHO PHÉP GIAO HÀNG TỪNG PHẦN)
Transhipment: NOT ALLOWED

ARTICLE 3: PAYMENT TERMS
Payment by Irrevocable Usance Documentary Letter of Credit payable at 60 days after Bill of Lading date (By Acceptance), opened through Joint Stock Commercial Bank for Foreign Trade of Vietnam (Vietcombank).
Advising Bank: BANK OF CHINA, SHANGHAI BRANCH
SWIFT BIC: BKCHCNBJ300

ARTICLE 4: REQUIRED DOCUMENTS FOR PRESENTATION
- Signed Commercial Invoice in 03 originals.
- Full set (3/3) Clean Shipped on Board Marine Bill of Lading marked "Freight Collect" and notify Applicant.
- Packing List in 03 originals showing net weight and gross weight.
- Certificate of Origin Form E (ASEAN-China FTA) in 01 original and 02 copies.
- Beneficiary's Certificate confirming that copy of shipping documents has been sent to Buyer within 03 days after shipment.

Presentation Period: Documents must be presented within 15 days after B/L date.
Insurance: Marine Insurance to be covered by the Buyer.
`;

// MẪU 3: BẪY NGHIỆP VỤ (EXW TOKYO, B/L VẬN TẢI BIỂN, HẠN GIAO = HẠN L/C)
const CONTRACT_3_EXW_TRAP = `SALES CONTRACT / HỢP ĐỒNG NGOẠI THƯƠNG
Sales Contract No.: EXW-TRAP-2026-99
Contract Date: 10 November 2026

THE BUYER (APPLICANT / BÊN MUA):
HANOI HIGH-TECH ELECTRONICS JSC
Address: Hoa Lac Hi-Tech Park, Thach That District, Hanoi City, Vietnam

THE SELLER (BENEFICIARY / BÊN BÁN):
TOKYO SEMICONDUCTOR & SENSOR LAB CO., LTD
Address: 4-1-1 Roppongi, Minato-ku, Tokyo 106-0032, Japan

ARTICLE 1: COMMODITY & VALUE
Description of Goods: PRECISION OPTICAL SENSORS & INDUSTRIAL LASER MODULES, MODEL OPT-X900
Quantity: 500 UNITS
Unit Price: USD 190.00 / UNIT
Total Contract Value: USD 95,000.00
Delivery Terms: EXW SELLER WAREHOUSE TOKYO, JAPAN (INCOTERMS 2020)
Tolerance: +/- 0%

ARTICLE 2: SHIPMENT & RISKS
Port of Loading: TOKYO PORT, JAPAN
Port of Discharge: CAT LAI PORT, HO CHI MINH CITY, VIETNAM
Latest Shipment Date: 20 December 2026
Partial Shipments: NOT ALLOWED
Transhipment: ALLOWED

ARTICLE 3: PAYMENT
By Irrevocable Letter of Credit At Sight for 100% invoice value.
Advising Bank: MIZUHO BANK, LTD., TOKYO HEAD OFFICE
SWIFT BIC: MHCBJPJTXXX

ARTICLE 4: DOCUMENTS REQUIRED
- Commercial Invoice in 03 originals.
- Clean Shipped on Board Marine Bill of Lading marked Freight Prepaid.
- Packing List in 03 originals.
- Certificate of Origin issued by Chamber of Commerce.

NOTE: Documents must be presented within 10 days after shipment, but L/C Expiry Date is fixed strictly on 20 December 2026.
`;

function main() {
  // Ghi 3 hợp đồng mẫu chuẩn
  writeSampleFile('contracts/01_Sales_Contract_CIF_Machinery_Japan.docx', CONTRACT_1_CIF_JAPAN);
  writeSampleFile('contracts/01_Sales_Contract_CIF_Machinery_Japan.txt', CONTRACT_1_CIF_JAPAN);

  writeSampleFile('contracts/02_Sales_Contract_FOB_China_Usance.docx', CONTRACT_2_FOB_CHINA_USANCE);
  writeSampleFile('contracts/02_Sales_Contract_FOB_China_Usance.txt', CONTRACT_2_FOB_CHINA_USANCE);

  writeSampleFile('contracts/03_Sales_Contract_EXW_Trap_Warning.docx', CONTRACT_3_EXW_TRAP);
  writeSampleFile('contracts/03_Sales_Contract_EXW_Trap_Warning.txt', CONTRACT_3_EXW_TRAP);

  // Giữ lại các tên cũ để tương thích các script trước
  writeSampleFile('contracts/Sales_Contract_CIF_Machinery_Japan.docx', CONTRACT_1_CIF_JAPAN);
  writeSampleFile('contracts/Sales_Contract_CIF_Machinery_Japan.txt', CONTRACT_1_CIF_JAPAN);
  writeSampleFile('contracts/Sales_Contract_FOB_Plastic_Resin_Korea.docx', CONTRACT_2_FOB_CHINA_USANCE);
  writeSampleFile('contracts/Sales_Contract_CFR_Steel_Coils_China.docx', CONTRACT_3_EXW_TRAP);

  console.log('Successfully generated 3 comprehensive real-world sample contracts under sample_files/contracts/');
}

if (require.main === module) {
  main();
}

module.exports = { createDocxBuffer };
