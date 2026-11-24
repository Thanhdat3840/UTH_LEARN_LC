'use strict';

/**
 * Bộ máy xử lý nghiệp vụ Thư tín dụng Nhập khẩu (Import L/C)
 * Chuẩn UCP 600, ISBP 745, Incoterms 2020 và điện SWIFT MT700 / MT707 / MT734.
 * Dùng chung cho cả trình duyệt (window.UCP600Engine) và Node.js (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UCP600Engine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const ISSUING_BANKS = {
    VCB: {
      code: 'VCB',
      name: 'NGÂN HÀNG TMCP NGOẠI THƯƠNG VIỆT NAM (VIETCOMBANK)',
      englishName: 'JOINT STOCK COMMERCIAL BANK FOR FOREIGN TRADE OF VIETNAM',
      bic: 'BFTVVNVXXXX',
      shortBic: 'BFTVVNVX',
      branch: 'CHI NHÁNH TP. HỒ CHÍ MINH',
      address: 'Số 5 Công trường Mê Linh, P. Bến Nghé, Quận 1, TP. Hồ Chí Minh, Việt Nam',
      issuanceFeeRate: 0.0012, // 0.12%
      minIssuanceFeeUsd: 50,
      swiftFeeUsd: 30,
      amendFeeUsd: 50,
      discrepancyFeeUsd: 80
    },
    BIDV: {
      code: 'BIDV',
      name: 'NGÂN HÀNG TMCP ĐẦU TƯ VÀ PHÁT TRIỂN VIỆT NAM (BIDV)',
      englishName: 'JOINT STOCK COMMERCIAL BANK FOR INVESTMENT AND DEVELOPMENT OF VIETNAM',
      bic: 'BIDVVNVXXXX',
      shortBic: 'BIDVVNVX',
      branch: 'CHI NHÁNH SỞ GIAO DỊCH 2',
      address: 'Số 4-6 Võ Văn Kiệt, P. Nguyễn Thái Bình, Quận 1, TP. Hồ Chí Minh, Việt Nam',
      issuanceFeeRate: 0.0015,
      minIssuanceFeeUsd: 50,
      swiftFeeUsd: 30,
      amendFeeUsd: 50,
      discrepancyFeeUsd: 90
    },
    VTB: {
      code: 'VTB',
      name: 'NGÂN HÀNG TMCP CÔNG THƯƠNG VIỆT NAM (VIETINBANK)',
      englishName: 'VIETNAM JOINT STOCK COMMERCIAL BANK FOR INDUSTRY AND TRADE',
      bic: 'ICBVVNVXXXX',
      shortBic: 'ICBVVNVX',
      branch: 'CHI NHÁNH TP. HÀ NỘI',
      address: '108 Trần Hưng Đạo, Q. Hoàn Kiếm, TP. Hà Nội, Việt Nam',
      issuanceFeeRate: 0.0012,
      minIssuanceFeeUsd: 50,
      swiftFeeUsd: 30,
      amendFeeUsd: 50,
      discrepancyFeeUsd: 85
    },
    TCB: {
      code: 'TCB',
      name: 'NGÂN HÀNG TMCP KỸ THƯƠNG VIỆT NAM (TECHCOMBANK)',
      englishName: 'VIETNAM TECHNOLOGICAL AND COMMERCIAL JOINT STOCK BANK',
      bic: 'VTCBVNVXXXX',
      shortBic: 'VTCBVNVX',
      branch: 'HỘI SỞ CHÍNH - HÀ NỘI',
      address: 'Số 6 Quang Trung, Q. Hoàn Kiếm, TP. Hà Nội, Việt Nam',
      issuanceFeeRate: 0.0011,
      minIssuanceFeeUsd: 45,
      swiftFeeUsd: 30,
      amendFeeUsd: 45,
      discrepancyFeeUsd: 100
    },
    ACB: {
      code: 'ACB',
      name: 'NGÂN HÀNG TMCP Á CHÂU (ACB)',
      englishName: 'ASIA COMMERCIAL JOINT STOCK BANK',
      bic: 'ASCBVNVXXXX',
      shortBic: 'ASCBVNVX',
      branch: 'CHI NHÁNH TP. HỒ CHÍ MINH',
      address: '442 Nguyễn Thị Minh Khai, P. 5, Quận 3, TP. Hồ Chí Minh, Việt Nam',
      issuanceFeeRate: 0.0012,
      minIssuanceFeeUsd: 50,
      swiftFeeUsd: 30,
      amendFeeUsd: 50,
      discrepancyFeeUsd: 80
    },
    MB: {
      code: 'MB',
      name: 'NGÂN HÀNG TMCP QUÂN ĐỘI (MB BANK)',
      englishName: 'MILITARY COMMERCIAL JOINT STOCK BANK',
      bic: 'MSCBVNVXXXX',
      shortBic: 'MSCBVNVX',
      branch: 'CHI NHÁNH SỞ GIAO DỊCH 1',
      address: 'Số 18 Lê Văn Lương, Q. Cầu Giấy, TP. Hà Nội, Việt Nam',
      issuanceFeeRate: 0.0011,
      minIssuanceFeeUsd: 45,
      swiftFeeUsd: 25,
      amendFeeUsd: 45,
      discrepancyFeeUsd: 80
    },
    STB: {
      code: 'STB',
      name: 'NGÂN HÀNG TMCP SÀI GÒN THƯƠNG TÍN (SACOMBANK)',
      englishName: 'SAIGON THUONG TIN COMMERCIAL JOINT STOCK BANK',
      bic: 'SGTTVNVXXXX',
      shortBic: 'SGTTVNVX',
      branch: 'CHI NHÁNH TRUNG TÂM',
      address: '266-268 Nam Kỳ Khởi Nghĩa, P. Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh, Việt Nam',
      issuanceFeeRate: 0.0012,
      minIssuanceFeeUsd: 50,
      swiftFeeUsd: 30,
      amendFeeUsd: 50,
      discrepancyFeeUsd: 85
    },
    VPB: {
      code: 'VPB',
      name: 'NGÂN HÀNG TMCP VIỆT NAM THỊNH VƯỢNG (VPBANK)',
      englishName: 'VIETNAM PROSPERITY JOINT STOCK COMMERCIAL BANK',
      bic: 'VPBKVNVXXXX',
      shortBic: 'VPBKVNVX',
      branch: 'CHI NHÁNH BẾN THÀNH',
      address: '89 Láng Hạ, Q. Đống Đa, TP. Hà Nội, Việt Nam',
      issuanceFeeRate: 0.0012,
      minIssuanceFeeUsd: 50,
      swiftFeeUsd: 30,
      amendFeeUsd: 50,
      discrepancyFeeUsd: 90
    },
    EIB: {
      code: 'EIB',
      name: 'NGÂN HÀNG TMCP XUẤT NHẬP KHẨU VIỆT NAM (EXIMBANK)',
      englishName: 'VIETNAM EXPORT IMPORT COMMERCIAL JOINT STOCK BANK',
      bic: 'EBVIVNVXXXX',
      shortBic: 'EBVIVNVX',
      branch: 'CHI NHÁNH SỞ GIAO DỊCH 1',
      address: 'Tầng 8, Tòa nhà Vincom Center, 72 Lê Thánh Tôn, Q.1, TP. Hồ Chí Minh, Việt Nam',
      issuanceFeeRate: 0.0012,
      minIssuanceFeeUsd: 50,
      swiftFeeUsd: 30,
      amendFeeUsd: 50,
      discrepancyFeeUsd: 66
    }
  };

  function getBankInfo(lcData) {
    const code = (lcData && lcData.issuingBankCode) ? String(lcData.issuingBankCode).toUpperCase() : 'VCB';
    if (code === 'OTHER') {
      const customName = (lcData.customBankName || 'NGÂN HÀNG PHÁT HÀNH L/C').trim();
      const rawBic = (lcData.customBankBic || 'BANKVNVXXXX').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const paddedBic = (rawBic || 'BANKVNVXXXX').padEnd(11, 'X').slice(0, 11);
      return {
        code: 'OTHER',
        name: customName.toUpperCase(),
        englishName: (lcData.customBankEnglishName || customName).toUpperCase(),
        bic: paddedBic,
        shortBic: paddedBic.slice(0, 8),
        branch: (lcData.customBankBranch || 'CHI NHÁNH GIAO DỊCH').toUpperCase(),
        address: lcData.customBankAddress || 'Việt Nam',
        issuanceFeeRate: 0.0012,
        minIssuanceFeeUsd: 50,
        swiftFeeUsd: 30,
        amendFeeUsd: 50,
        discrepancyFeeUsd: 85
      };
    }
    return ISSUING_BANKS[code] || ISSUING_BANKS.VCB;
  }

  // Từ điển chú giải Tooltip cho từng trường SWIFT MT700
  const SWIFT_TOOLTIPS = {
    ':20:': {
      title: 'Trường 20: Documentary Credit Number (Số hiệu L/C)',
      name: 'Documentary Credit Number',
      meaning: 'Số hiệu độc nhất do Ngân hàng Phát hành (Issuing Bank) đặt cho bức điện L/C để quản lý và theo dõi xuyên suốt giao dịch.',
      warning: 'Mọi chứng từ xuất trình (Invoice, B/L, C/O...) và điện trao đổi sau này đều phải trích dẫn chính xác số hiệu này (UCP 600 Điều 14d).'
    },
    ':31C:': {
      title: 'Trường 31C: Date of Issue (Ngày phát hành L/C)',
      name: 'Date of Issue',
      meaning: 'Ngày bức điện L/C chính thức được Ngân hàng phát hành truyền đi qua mạng SWIFT.',
      warning: 'Định dạng bắt buộc SWIFT là YYMMDD. Chứng từ thường không được phát hành trước ngày này nếu Trường 47A có ràng buộc.'
    },
    ':40A:': {
      title: 'Trường 40A: Form of Documentary Credit (Loại Thư tín dụng)',
      name: 'Form of Documentary Credit',
      meaning: 'Xác định tính chất pháp lý của L/C. Theo UCP 600 Điều 3, mọi L/C đều là Không hủy ngang (IRREVOCABLE).',
      warning: 'Nếu không ghi rõ, L/C mặc định là Irrevocable. Không còn tồn tại L/C có thể hủy ngang (Revocable) trong thực tế.'
    },
    ':50:': {
      title: 'Trường 50: Applicant (Người đề nghị mở L/C)',
      name: 'Applicant',
      meaning: 'Tên và địa chỉ đầy đủ của Bên mua (Nhà nhập khẩu) - người ký quỹ và yêu cầu ngân hàng phát hành cam kết thanh toán.',
      warning: 'Chuẩn SWIFT giới hạn tối đa 4 dòng x 35 ký tự/dòng. Tên và địa chỉ trên Commercial Invoice phải khớp hoặc không mâu thuẫn.'
    },
    ':59:': {
      title: 'Trường 59: Beneficiary (Người thụ hưởng L/C)',
      name: 'Beneficiary',
      meaning: 'Tên và địa chỉ đầy đủ của Bên bán (Nhà xuất khẩu) - người duy nhất có quyền đòi tiền khi xuất trình bộ chứng từ hợp lệ.',
      warning: 'Giới hạn 4 dòng x 35 ký tự/dòng. Phải khớp tuyệt đối từng ký tự trên Hóa đơn thương mại theo UCP 600 Điều 18a(ii).'
    },
    ':57A:': {
      title: 'Trường 57A: Advising Bank (Ngân hàng Thông báo)',
      name: 'Advising Bank',
      meaning: 'Ngân hàng phục vụ Người bán ở nước xuất khẩu, nhận điện MT700 từ Issuing Bank và thông báo bản chính thức cho Beneficiary.',
      warning: 'Nên ghi kèm mã SWIFT BIC 8 hoặc 11 ký tự (VD: SMBCJPJTXXX) để điện được truyền tự động qua mạng SWIFT không bị tắc nghẽn.'
    },
    ':32B:': {
      title: 'Trường 32B: Currency Code, Amount (Mã tiền tệ & Số tiền)',
      name: 'Currency Code, Amount',
      meaning: 'Đơn vị tiền tệ (3 chữ cái ISO: USD, EUR, JPY...) và tổng trị giá danh nghĩa tối đa của L/C.',
      warning: 'Trong điện SWIFT thực tế dùng dấu phẩy (,) ngăn cách phần thập phân (VD: USD125000,00). Trị giá hóa đơn không được vượt mức này trừ khi có dung sai.'
    },
    ':39A:': {
      title: 'Trường 39A: Percentage Credit Amount Tolerance (Dung sai số tiền)',
      name: 'Tolerance (+% / -%)',
      meaning: 'Tỷ lệ phần trăm cho phép giao thừa (+) hoặc giao thiếu (-) trị giá và số lượng hàng hóa (thường 5% hoặc 10% với hàng rời).',
      warning: 'Dung sai tăng làm tăng số tiền bảo đảm/ký quỹ mà ngân hàng phong tỏa đối với nhà nhập khẩu. Nếu hàng đóng gói kiện đếm được thì nên để 0/0.'
    },
    ':44E:': {
      title: 'Trường 44E: Port of Loading / Airport of Departure (Cảng xếp hàng)',
      name: 'Port of Loading',
      meaning: 'Cảng biển hoặc sân bay nơi hàng hóa được xếp lên phương tiện vận tải quốc tế tại nước người bán.',
      warning: 'Giới hạn 65 ký tự. Vận đơn (B/L) phải thể hiện cảng xếp hàng khớp với trường này theo UCP 600 Điều 20a(iii).'
    },
    ':44F:': {
      title: 'Trường 44F: Port of Discharge / Airport of Destination (Cảng dỡ hàng)',
      name: 'Port of Discharge',
      meaning: 'Cảng biển hoặc sân bay tại nước người mua nơi hàng hóa được dỡ xuống (VD: CAT LAI PORT, HO CHI MINH CITY).',
      warning: 'Giới hạn 65 ký tự. Nếu B/L thể hiện cảng dỡ hàng khác với 44F thì bị tính là lỗi bất hợp lệ nghiêm trọng.'
    },
    ':44C:': {
      title: 'Trường 44C: Latest Date of Shipment (Ngày giao hàng muộn nhất)',
      name: 'Latest Date of Shipment',
      meaning: 'Hạn chót mà hàng hóa phải được xếp lên tàu (căn cứ theo ngày Shipped on Board trên Bill of Lading).',
      warning: 'B/L có ngày on board sau ngày 44C sẽ bị Ngân hàng từ chối thanh toán vì lỗi Giao hàng trễ (Late Shipment - UCP 600 Điều 20).'
    },
    ':31D:': {
      title: 'Trường 31D: Date and Place of Expiry (Ngày và Nơi hết hạn L/C)',
      name: 'Date & Place of Expiry',
      meaning: 'Hạn chót và địa điểm để Người bán xuất trình bộ chứng từ đòi tiền tại Ngân hàng chỉ định hoặc Ngân hàng phát hành.',
      warning: 'Bắt buộc: Ngày 31D phải sau ngày giao hàng 44C ít nhất 15-21 ngày (theo thời hạn xuất trình trường 48). Nếu 31D <= 44C là bẫy bất khả thi!'
    },
    ':43P:': {
      title: 'Trường 43P: Partial Shipments (Giao hàng từng phần)',
      name: 'Partial Shipments',
      meaning: 'Quy định cho phép (ALLOWED) hay cấm (NOT ALLOWED) người bán chia nhỏ hàng hóa giao thành nhiều chuyến tàu khác nhau.',
      warning: 'Nếu chọn NOT ALLOWED, người bán bắt buộc phải giao trọn gói toàn bộ lô hàng trên cùng một chuyến tàu và cùng một hành trình.'
    },
    ':43T:': {
      title: 'Trường 43T: Transhipment (Chuyển tải)',
      name: 'Transhipment',
      meaning: 'Quy định việc dỡ hàng từ tàu này sang tàu khác trong quá trình vận chuyển từ cảng đi đến cảng đến.',
      warning: 'Hàng container (FCL) theo UCP 600 Điều 20c luôn được phép chuyển tải dù L/C ghi cấm, miễn là toàn bộ hành trình đi bằng một B/L duy nhất.'
    },
    ':41A:': {
      title: 'Trường 41A/D: Available With ... By ... (Phương thức Thanh toán L/C)',
      name: 'Available With ... By ...',
      meaning: 'Xác định Ngân hàng được chỉ định thực hiện thanh toán và phương thức: Trả ngay (BY PAYMENT), Chấp nhận (BY ACCEPTANCE), Trả chậm (BY DEF PAYMENT).',
      warning: 'Phải đồng bộ với trường 42C. Trả ngay (Payment) đi với hối phiếu At sight; Chấp nhận (Acceptance) đi với hối phiếu kỳ hạn (Usance).'
    },
    ':42C:': {
      title: 'Trường 42C: Drafts at ... (Kỳ hạn Hối phiếu)',
      name: 'Drafts at ...',
      meaning: 'Kỳ hạn đòi tiền ghi trên Hối phiếu (Bill of Exchange). Ví dụ: AT SIGHT (trả ngay) hoặc 60 DAYS AFTER B/L DATE (trả chậm 60 ngày).',
      warning: 'Nếu trường 41 chọn BY PAYMENT mà trường 42C lại ghi kỳ hạn 60 ngày thì sẽ gây mâu thuẫn điều khoản thanh toán ngay trên bức điện.'
    },
    ':42A:': {
      title: 'Trường 42A: Drawee (Người bị ký phát hối phiếu)',
      name: 'Drawee',
      meaning: 'Bên có nghĩa vụ thanh toán số tiền trên hối phiếu (thường là Ngân hàng phát hành - Issuing Bank).',
      warning: 'Theo UCP 600 Điều 6c, Hối phiếu không được ký phát lên Người mở L/C (Applicant). Phải ký phát lên Ngân hàng.'
    },
    ':45A:': {
      title: 'Trường 45A: Description of Goods and/or Services (Mô tả hàng hóa)',
      name: 'Description of Goods and/or Services',
      meaning: 'Nội dung mô tả tên hàng, model, số lượng, đơn giá, số hợp đồng và điều kiện Incoterms 2020.',
      warning: 'SWIFT MT700 không có Tag riêng cho Incoterms nên Incoterms được ghi vào cuối trường này. Mô tả trên Commercial Invoice phải khớp tuyệt đối (UCP 600 Điều 18c).'
    }
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toSwiftDate(isoDate) {
    if (!isoDate) return '';
    const m = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return m[1].slice(2) + m[2] + m[3];
  }

  function formatSwiftAmount(amount) {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) return '0,00';
    return num.toFixed(2).replace('.', ',');
  }

  function formatHumanAmount(amount, currency) {
    const num = Number(amount);
    if (!Number.isFinite(num)) return '0.00';
    return (currency ? currency + ' ' : '') + num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function addDaysIso(isoDate, days) {
    if (!isoDate) return '';
    const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function diffDaysIso(dateA, dateB) {
    if (!dateA || !dateB) return null;
    const a = new Date(dateA + 'T00:00:00Z');
    const b = new Date(dateB + 'T00:00:00Z');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }

  function isShortSeaRoute(portOfLoading) {
    if (!portOfLoading) return false;
    const p = portOfLoading.toUpperCase();
    const nearKeywords = [
      'CHINA', 'SHANGHAI', 'NINGBO', 'SHENZHEN', 'QINGDAO', 'XIAMEN', 'GUANGZHOU', 'TIANJIN', 'DALIAN',
      'HONG KONG', 'TAIWAN', 'KAOHSIUNG', 'KEELUNG', 'KOREA', 'BUSAN', 'INCHEON', 'PYEONGTAEK',
      'JAPAN', 'YOKOHAMA', 'TOKYO', 'OSAKA', 'KOBE', 'NAGOYA',
      'SINGAPORE', 'THAILAND', 'BANGKOK', 'LAEM CHABANG', 'MALAYSIA', 'PORT KLANG', 'INDONESIA', 'JAKARTA', 'SURABAYA'
    ];
    return nearKeywords.some(k => p.includes(k));
  }

  function parseNumberSafe(val) {
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    if (!val) return 0;
    const cleaned = String(val).replace(/[^\d.,-]/g, '').trim();
    if (!cleaned) return 0;
    let normalized = cleaned;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
      normalized = cleaned.replace(/,/g, '');
    } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      const parts = cleaned.split(',');
      if (parts[1] && parts[1].length <= 2) {
        normalized = parts[0] + '.' + parts[1];
      } else {
        normalized = cleaned.replace(/,/g, '');
      }
    }
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  function extractLineTokens(text, maxLineLen) {
    const limit = maxLineLen || 65;
    const lines = String(text || '').split('\n');
    const out = [];
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (line.length <= limit) {
        out.push(line);
      } else {
        const words = line.split(/\s+/);
        let cur = '';
        for (const w of words) {
          if ((cur + ' ' + w).trim().length > limit) {
            if (cur) out.push(cur);
            cur = w;
          } else {
            cur = (cur ? cur + ' ' : '') + w;
          }
        }
        if (cur) out.push(cur);
      }
    }
    return out.join('\n');
  }

  /**
   * Kiểm tra ký tự không thuộc SWIFT X-Character Set
   * SWIFT X-set: a-z A-Z 0-9 / - ? : ( ) . , ' + Cr Lf Space
   */
  function checkSwiftCharacterSet(text) {
    if (!text) return { isValid: true, invalidChars: [] };
    const invalid = [];
    // Tìm ký tự có dấu tiếng Việt hoặc ký tự đặc biệt như @, #, $, %, ^, &, *, ~, `, ", <, >
    const regex = /[^a-zA-Z0-9\/\-?:().,'+\r\n ]/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (!invalid.includes(m[0])) invalid.push(m[0]);
    }
    return {
      isValid: invalid.length === 0,
      invalidChars: invalid
    };
  }

  /**
   * Tự động tạo các trường chuẩn SWIFT MT700 (45A, 46A, 47A, 48, 49, 71D, 78) từ dữ liệu Hợp đồng
   */
  function buildDefaultMT700Clauses(data) {
    const incoterm = (data.incoterms || 'CIF').toUpperCase().trim();
    const contractNo = data.contractNo || 'N/A';
    const contractDate = data.contractDate || '';
    const portOfDischarge = data.portOfDischarge || 'CAT LAI PORT, HO CHI MINH CITY, VIETNAM';
    const goodsRaw = data.goodsDescription || data.goodsSummary || 'GOODS AS PER SALES CONTRACT';
    const isCifOrCip = incoterm === 'CIF' || incoterm === 'CIP';
    const isCfrOrCpt = incoterm === 'CFR' || incoterm === 'CPT';
    const isFobOrFca = incoterm === 'FOB' || incoterm === 'FCA';
    const isExw = incoterm === 'EXW';
    const bankInfo = getBankInfo(data);

    // Trường 45A: Nối chuỗi chuẩn Incoterms 2020 vào cuối
    const field45A = [
      goodsRaw.toUpperCase(),
      `TERMS OF DELIVERY: ${incoterm} ${portOfDischarge.toUpperCase()} (INCOTERMS 2020)`,
      `AS PER SALES CONTRACT NO. ${contractNo}${contractDate ? ' DATED ' + contractDate : ''}.`
    ].join('\n');

    const docs46A = [];
    docs46A.push('+ SIGNED COMMERCIAL INVOICE IN 03 ORIGINALS INDICATING L/C NUMBER, CONTRACT NUMBER AND HS CODE.');

    if (isExw) {
      // EXW: người bán chỉ giao tại xưởng, chứng từ vận chuyển thực tế thường là Forwarder Cargo Receipt (FCR)
      docs46A.push('+ FORWARDER CARGO RECEIPT (FCR) OR WAREHOUSE DELIVERY ORDER ISSUED BY DESIGNATED FORWARDER ACKNOWLEDGING RECEIPT OF GOODS IN APPARENT GOOD ORDER AND CONDITION.');
    } else {
      const freightTerm = (isCifOrCip || isCfrOrCpt) ? 'FREIGHT PREPAID' : 'FREIGHT COLLECT';
      docs46A.push(
        `+ FULL SET (3/3) OF ORIGINAL CLEAN "SHIPPED ON BOARD" MARINE BILL OF LADING MADE OUT TO THE ORDER OF ${bankInfo.englishName}, MARKED "${freightTerm}" AND NOTIFY APPLICANT WITH FULL NAME AND ADDRESS.`
      );
    }

    docs46A.push('+ DETAILED PACKING LIST IN 03 ORIGINALS SHOWING QUANTITY, GROSS WEIGHT, NET WEIGHT AND PACKING DETAILS PER PACKAGE.');

    const coFormHint = (data.coType && String(data.coType).trim())
      ? data.coType.toUpperCase()
      : 'CERTIFICATE OF ORIGIN ISSUED BY CHAMBER OF COMMERCE OR COMPETENT AUTHORITY IN EXPORTING COUNTRY IN 01 ORIGINAL AND 02 COPIES.';
    docs46A.push('+ ' + coFormHint);

    if (isCifOrCip) {
      docs46A.push(
        '+ INSURANCE POLICY OR CERTIFICATE IN ASSIGNABLE FORM, ENDORSED IN BLANK, FOR AT LEAST 110 PCT OF INVOICE VALUE, COVERING INSTITUTE CARGO CLAUSES (A), INSTITUTE WAR CLAUSES (CARGO) AND INSTITUTE STRIKES CLAUSES (CARGO), SHOWING CLAIMS PAYABLE IN VIETNAM IN THE CURRENCY OF THE CREDIT.'
      );
    }

    if (data.requireQualityCert !== false) {
      docs46A.push('+ CERTIFICATE OF QUALITY AND QUANTITY ISSUED BY MANUFACTURER OR INDEPENDENT INSPECTION AGENCY (E.G. SGS/BUREAU VERITAS) IN 01 ORIGINAL AND 02 COPIES.');
    }

    docs46A.push(
      "+ BENEFICIARY'S CERTIFICATE CERTIFYING THAT ONE SET OF NON-NEGOTIABLE SHIPPING DOCUMENTS HAS BEEN SENT DIRECTLY TO APPLICANT WITHIN 05 DAYS AFTER SHIPMENT DATE BY COURIER/EMAIL (COURIER RECEIPT/EMAIL COPY ATTACHED)."
    );

    const field46A = docs46A.join('\n');

    const cond47A = [
      '+ ALL DOCUMENTS MUST BE ISSUED IN ENGLISH AND BEAR THIS DOCUMENTARY CREDIT NUMBER AND DATE OF ISSUE.',
      '+ DOCUMENTS DATED PRIOR TO L/C ISSUANCE DATE ARE NOT ACCEPTABLE.',
      '+ THIRD PARTY DOCUMENTS ARE NOT ACCEPTABLE EXCEPT BILL OF LADING, CERTIFICATE OF ORIGIN AND INSURANCE DOCUMENT.',
      '+ SPELLING AND/OR TYPING ERRORS NOT AFFECTING MEANING, QUANTITY, WEIGHT OR VALUE OF GOODS SHALL NOT BE CONSIDERED AS DISCREPANCIES.',
      `+ A DISCREPANCY FEE OF USD ${bankInfo.discrepancyFeeUsd}.00 (OR EQUIVALENT) PLUS CABLE CHARGES SHALL BE DEDUCTED FROM THE PROCEEDS FOR EACH PRESENTATION OF DISCREPANT DOCUMENTS.`
    ];

    if (isFobOrFca || isExw) {
      cond47A.push('+ INSURANCE TO BE COVERED BY APPLICANT IN VIETNAM.');
    }

    const field47A = cond47A.join('\n');
    const suggested48 = isShortSeaRoute(data.portOfLoading) ? 14 : 21;

    return {
      field45A,
      field46A,
      field47A,
      field71D: 'ALL BANKING CHARGES OUTSIDE VIETNAM ARE FOR BENEFICIARY\'S ACCOUNT.',
      field48: String(suggested48),
      field49: 'WITHOUT',
      field78: 'UPON RECEIPT OF DOCUMENTS STRICTLY COMPLYING WITH THE TERMS AND CONDITIONS OF THIS CREDIT, WE SHALL REMIT PROCEEDS AS PER PRESENTING BANK\'S INSTRUCTIONS WITHIN 05 BANKING DAYS.'
    };
  }

  function calculateFinancials(lcData) {
    const bank = getBankInfo(lcData);
    const amount = parseNumberSafe(lcData.amount);
    const tolerancePlus = parseNumberSafe(lcData.tolerancePlus || 0);
    const maxExposure = amount * (1 + tolerancePlus / 100);
    const depositPercent = Math.min(100, Math.max(0, parseNumberSafe(lcData.depositPercent !== undefined ? lcData.depositPercent : 100)));
    const exchangeRate = parseNumberSafe(lcData.exchangeRate || 25450);
    const currency = (lcData.currency || 'USD').toUpperCase();

    const depositAmountForeign = maxExposure * (depositPercent / 100);
    const creditLineUsedForeign = maxExposure - depositAmountForeign;

    const usdEquivalent = currency === 'USD' ? maxExposure : maxExposure * (currency === 'EUR' ? 1.08 : currency === 'JPY' ? 0.0067 : 1);
    const issuanceFeeUsd = Math.max(bank.minIssuanceFeeUsd, Number((usdEquivalent * bank.issuanceFeeRate).toFixed(2)));
    const swiftFeeUsd = bank.swiftFeeUsd;
    const totalBankFeeUsd = Number((issuanceFeeUsd + swiftFeeUsd).toFixed(2));

    const depositAmountVnd = currency === 'VND' ? depositAmountForeign : Math.round(depositAmountForeign * exchangeRate);
    const totalBankFeeVnd = Math.round(totalBankFeeUsd * exchangeRate);

    return {
      bank,
      amount,
      maxExposure,
      depositPercent,
      depositAmountForeign,
      creditLineUsedForeign,
      depositAmountVnd,
      issuanceFeeUsd,
      swiftFeeUsd,
      totalBankFeeUsd,
      totalBankFeeVnd
    };
  }

  /**
   * Bộ kiểm tra Tuân thủ & Cảnh báo Rủi ro theo UCP 600 / ISBP 745 / Incoterms 2020
   */
  function validateLCApplication(lcData, contractData) {
    const findings = [];
    const c = contractData || {};
    const incoterm = (lcData.incoterms || c.incoterms || '').toUpperCase().trim();
    const f45 = (lcData.field45A || '').toUpperCase();
    const f46 = (lcData.field46A || '').toUpperCase();
    const f47 = (lcData.field47A || '').toUpperCase();

    function add(severity, code, article, title, detail, suggestion) {
      findings.push({ severity, code, article, title, detail, suggestion });
    }

    // 1. Kiểm tra các trường bắt buộc của MT700
    const requiredFields = [
      { key: 'lcNumber', label: 'Trường 20 (Số L/C)' },
      { key: 'issueDate', label: 'Trường 31C (Ngày phát hành)' },
      { key: 'expiryDate', label: 'Trường 31D (Ngày hết hạn)' },
      { key: 'applicantName', label: 'Trường 50 (Người mở L/C - Applicant)' },
      { key: 'beneficiaryName', label: 'Trường 59 (Người thụ hưởng - Beneficiary)' },
      { key: 'currency', label: 'Trường 32B (Loại tiền tệ)' },
      { key: 'amount', label: 'Trường 32B (Số tiền L/C)' },
      { key: 'portOfLoading', label: 'Trường 44E (Cảng xếp hàng)' },
      { key: 'portOfDischarge', label: 'Trường 44F (Cảng dỡ hàng)' },
      { key: 'latestShipmentDate', label: 'Trường 44C (Ngày giao hàng muộn nhất)' }
    ];

    const missing = requiredFields.filter(f => !lcData[f.key] || String(lcData[f.key]).trim() === '' || (f.key === 'amount' && parseNumberSafe(lcData.amount) <= 0));
    if (missing.length > 0) {
      add(
        'ERROR',
        'MT700_MISSING_FIELDS',
        'Chuẩn SWIFT MT700 (M Fields)',
        `Thiếu ${missing.length} trường bắt buộc để phát hành điện MT700`,
        'Các trường đang trống: ' + missing.map(m => m.label).join(', ') + '.',
        'Điền đầy đủ các trường bắt buộc trước khi gửi lệnh phát hành tới ngân hàng.'
      );
    } else {
      add(
        'PASS',
        'MT700_MANDATORY_OK',
        'Chuẩn SWIFT MT700',
        'Đầy đủ các trường định danh cốt lõi (20, 31C, 31D, 50, 59, 32B, 44E, 44F, 44C)',
        'Cấu trúc thông tin cơ bản đáp ứng điều kiện lập điện MT700.',
        ''
      );
    }

    // 2. Kiểm tra logic chuỗi thời gian UCP 600: Ngày ký HĐ <= 31C <= 44C <= 31D
    const dContract = lcData.contractDate;
    const dIssue = lcData.issueDate;
    const dShip = lcData.latestShipmentDate;
    const dExp = lcData.expiryDate;

    if (dContract && dIssue && diffDaysIso(dIssue, dContract) < 0) {
      add(
        'ERROR',
        'ISSUE_BEFORE_CONTRACT',
        'UCP 600 - Logic Thời gian Hợp đồng',
        'Ngày phát hành dự kiến (31C) sớm hơn Ngày ký Hợp đồng',
        `Ngày phát hành dự kiến phải nằm trong khoảng từ [${dContract}] (Ngày ký Hợp đồng) đến [${dShip || 'Ngày giao hàng muộn nhất'}]. Hiện tại ngày phát hành là ${dIssue}.`,
        `Điều chỉnh Ngày phát hành dự kiến (:31C:) từ ngày ${dContract} trở đi.`
      );
    }

    if (dIssue && dShip && diffDaysIso(dShip, dIssue) < 0) {
      add(
        'ERROR',
        'SHIPMENT_BEFORE_ISSUE',
        'UCP 600 - Logic Thời gian',
        'Ngày giao hàng muộn nhất (44C) nằm trước Ngày phát hành L/C (31C)',
        `Ngày phát hành là ${dIssue} nhưng ngày giao hàng muộn nhất lại là ${dShip}. Người bán không thể giao hàng hợp lệ theo L/C chưa mở.`,
        'Điều chỉnh Trường 44C sau ngày phát hành Trường 31C ít nhất 10-30 ngày.'
      );
    }

    if (dShip && dExp) {
      const gap = diffDaysIso(dExp, dShip);
      const days48 = parseNumberSafe(lcData.field48 || 21);
      if (gap < 0) {
        add(
          'ERROR',
          'EXPIRY_BEFORE_SHIPMENT',
          'UCP 600 Điều 6(d)(i) & 14(c)',
          'Ngày hết hạn L/C (31D) sớm hơn Ngày giao hàng muộn nhất (44C)',
          `Ngày hết hạn (${dExp}) đang trước Ngày giao hàng muộn nhất (${dShip}). L/C bị vô hiệu hóa ngay khi giao hàng xong.`,
          `Đặt Trường 31D sau Trường 44C ít nhất ${days48} ngày (khuyến nghị: ${addDaysIso(dShip, days48)}).`
        );
      } else if (gap === 0) {
        add(
          'ERROR',
          'EXPIRY_EQUALS_SHIPMENT_TRAP',
          'UCP 600 Điều 6(d) & 14(c)',
          'Bẫy nghiệp vụ: Ngày hết hạn L/C (31D) trùng đúng Ngày giao hàng muộn nhất (44C)!',
          `Cả hai ngày đều là ${dShip}. Người bán giao hàng xong trên tàu biển sẽ không thể có thời gian (tối thiểu 15-21 ngày) để hãng tàu cấp B/L gốc và xuất trình chứng từ tới ngân hàng kịp hạn.`,
          `Gia hạn Trường 31D sau 44C ít nhất ${days48} ngày (khuyến nghị: ${addDaysIso(dShip, days48)}).`
        );
      } else if (gap < 7) {
        add(
          'WARNING',
          'TIGHT_EXPIRY_WINDOW',
          'UCP 600 Điều 14(c)',
          'Khoảng thời gian từ ngày giao hàng (44C) đến hết hạn (31D) quá ngắn',
          `Chỉ có ${gap} ngày từ 44C (${dShip}) đến 31D (${dExp}). Nếu người bán giao sát hạn 44C, họ có thể không kịp thu thập B/L gốc để xuất trình.`,
          `Nên để khoảng cách từ 44C đến 31D từ ${Math.max(14, days48)} đến 21 ngày.`
        );
      } else {
        add(
          'PASS',
          'DATES_CONSISTENT',
          'UCP 600 Điều 6 & 14(c)',
          'Chuỗi mốc thời gian 31C -> 44C -> 31D hợp lý',
          `Khoảng đệm xuất trình chứng từ sau giao hàng đạt ${gap} ngày (thời hạn trường 48 là ${days48} ngày).`,
          ''
        );
      }
    }

    // 3. Cảnh báo thông minh điều kiện EXW
    if (incoterm === 'EXW') {
      const hasOceanBL = f46.includes('BILL OF LADING') || f46.includes('B/L') || f46.includes('SHIPPED ON BOARD');
      const hasPorts = (lcData.portOfLoading && lcData.portOfLoading.trim()) || (lcData.portOfDischarge && lcData.portOfDischarge.trim());
      if (hasOceanBL || hasPorts) {
        add(
          'WARNING',
          'EXW_OCEAN_BL_MISMATCH',
          'Incoterms 2020 & UCP 600 Khuyến cáo ICC',
          'Mâu thuẫn nghiệp vụ: Hợp đồng EXW (Giao tại xưởng) nhưng lại yêu cầu Cảng biển & Vận đơn tàu biển (B/L)',
          'Theo Incoterms 2020, người bán EXW chỉ có nghĩa vụ giao hàng tại kho xưởng của mình và không chịu trách nhiệm làm thủ tục hải quan xuất khẩu hay xếp hàng lên tàu biển. Việc đòi B/L Shipped on Board khiến người bán phụ thuộc hoàn toàn vào Forwarder của người mua, cực kỳ dễ dẫn đến tranh chấp và bất hợp lệ chứng từ.',
          'Nên chuyển sang điều kiện FCA (Giao cho người chuyên chở) hoặc thay thế yêu cầu B/L biển bằng Forwarder Cargo Receipt (FCR) / Biên bản giao nhận kho.'
        );
      }
    }

    // 4. (Đã gỡ bỏ việc đối chiếu cứng Số tiền / Loại tiền với dữ liệu bóc tách tạm thời để tôn trọng quyền chỉnh sửa của người dùng trên Form)

    // 5. Kiểm tra mâu thuẫn hối phiếu 41A và 42C
    const availBy = (lcData.availableBy || 'BY PAYMENT').toUpperCase();
    const tenor = (lcData.draftTenor || 'AT SIGHT').toUpperCase();
    if (availBy.includes('PAYMENT') && !availBy.includes('DEFERRED') && !tenor.includes('SIGHT') && /\d+\s*DAYS/.test(tenor)) {
      add(
        'ERROR',
        'TENOR_AVAILABILITY_CONFLICT',
        'UCP 600 Điều 6(b) & 7',
        'Mâu thuẫn giữa Phương thức thanh toán (41A/D) và Kỳ hạn hối phiếu (42C)',
        `Trường 41 chọn "${availBy}" (thường đi với trả ngay) nhưng Trường 42C lại ghi hối phiếu kỳ hạn "${tenor}".`,
        'Nếu trả chậm (Usance L/C), hãy đổi Trường 41 sang "BY ACCEPTANCE" hoặc "BY DEF PAYMENT" (hoặc "BY NEGOTIATION").'
      );
    }

    // 6. Quy tắc Vàng UCP 600 Điều 28: Incoterms CIF/CIP bắt buộc đòi Bảo hiểm 110% ở trường 46A
    if (incoterm === 'CIF' || incoterm === 'CIP') {
      const hasInsuranceDoc = /INSURANCE/.test(f46);
      const has110Pct = /110\s*(%|PCT|PERCENT)/.test(f46);
      if (!hasInsuranceDoc) {
        add(
          'ERROR',
          'CIF_MISSING_INSURANCE',
          'UCP 600 Điều 28 & Incoterms 2020',
          `Mua giá ${incoterm} nhưng Trường 46A thiếu chứng từ Bảo hiểm!`,
          `Theo Incoterms ${incoterm}, người bán có nghĩa vụ mua bảo hiểm cho người mua. Nếu 46A không yêu cầu Insurance Policy/Certificate, người bán vẫn lấy tiền bảo hiểm trong giá ${incoterm} mà không nộp đơn bảo hiểm.`,
          'Bổ sung yêu cầu: "INSURANCE POLICY/CERTIFICATE FOR AT LEAST 110 PCT OF INVOICE VALUE COVERING INSTITUTE CARGO CLAUSES (A)" vào Trường 46A.'
        );
      } else if (!has110Pct) {
        add(
          'WARNING',
          'INSURANCE_NO_110_PCT',
          'UCP 600 Điều 28(f)(ii)',
          'Chứng từ bảo hiểm ở 46A chưa ghi rõ mức tối thiểu 110% trị giá hóa đơn',
          'Dù Điều 28(f)(ii) UCP 600 mặc định mức tối thiểu 110% giá trị CIF/CIP, việc ghi rõ trong 46A giúp tránh tranh chấp về mức bảo hiểm và điều khoản bảo hiểm (Clauses A/B/C).',
          'Nêu rõ "FOR AT LEAST 110 PCT OF INVOICE VALUE COVERING INSTITUTE CARGO CLAUSES (A)" trong Trường 46A.'
        );
      } else {
        add(
          'PASS',
          'CIF_INSURANCE_OK',
          'UCP 600 Điều 28',
          `Điều khoản bảo hiểm khớp chuẩn ${incoterm} (tối thiểu 110%)`,
          'Trường 46A đã yêu cầu rõ Insurance Policy/Certificate 110% giá trị hóa đơn.',
          ''
        );
      }
    }

    // 7. Kiểm tra Freight Prepaid vs Freight Collect theo Incoterms trên Vận đơn (46A)
    if (f46.includes('BILL OF LADING') || f46.includes('B/L')) {
      if ((incoterm === 'FOB' || incoterm === 'FCA' || incoterm === 'EXW') && f46.includes('FREIGHT PREPAID')) {
        add(
          'ERROR',
          'FOB_FREIGHT_PREPAID_TRAP',
          'Incoterms 2020 & UCP 600 Điều 14(d)',
          `Bẫy mâu thuẫn cước: Mua giá ${incoterm} nhưng Vận đơn (46A) lại ghi "FREIGHT PREPAID"`,
          `Với điều kiện ${incoterm}, người mua tự trả cước biển quốc tế nên Vận đơn phải ghi "FREIGHT COLLECT". Nếu giữ "FREIGHT PREPAID", người bán sẽ không thể giao hàng hoặc bị hãng tàu giữ hàng do mâu thuẫn ai trả cước.`,
          'Sửa cụm từ trên Vận đơn trong Trường 46A thành "FREIGHT COLLECT".'
        );
      } else if ((incoterm === 'CIF' || incoterm === 'CFR' || incoterm === 'CIP' || incoterm === 'CPT') && f46.includes('FREIGHT COLLECT')) {
        add(
          'ERROR',
          'CIF_FREIGHT_COLLECT_TRAP',
          'Incoterms 2020 & UCP 600 Điều 14(d)',
          `Rủi ro trả tiền 2 lần: Mua giá ${incoterm} nhưng Vận đơn (46A) lại ghi "FREIGHT COLLECT"`,
          `Giá ${incoterm} đã bao gồm tiền cước vận tải. Nếu Vận đơn ghi "FREIGHT COLLECT", bạn sẽ phải trả thêm cước cho hãng tàu một lần nữa tại cảng đến.`,
          'Sửa cụm từ trên Vận đơn trong Trường 46A thành "FREIGHT PREPAID".'
        );
      }

      if (!f46.includes('CLEAN') || !f46.includes('ON BOARD')) {
        add(
          'WARNING',
          'BL_NOT_CLEAN_ON_BOARD',
          'UCP 600 Điều 20 & 27',
          'Yêu cầu Vận đơn ở 46A chưa nhấn mạnh "CLEAN" và "SHIPPED ON BOARD"',
          'Người bán có thể xuất trình vận đơn nhận hàng để chở (Received for Shipment) hoặc có ghi chú khuyết tật bao bì nếu không ràng buộc chặt.',
          'Bổ sung cụm từ: CLEAN "SHIPPED ON BOARD" MARINE BILL OF LADING.'
        );
      }

      if (!f46.includes('TO THE ORDER OF') && !f46.includes('TO ORDER OF')) {
        add(
          'WARNING',
          'BL_CONSIGNEE_RISK',
          'Quản trị Rủi ro Tài sản Bảo đảm (Ngân hàng VN)',
          'Vận đơn (46A) chưa quy định lập "TO THE ORDER OF ISSUING BANK"',
          'Nếu vận đơn ghi đích danh tên người mua (Straight B/L) hoặc "To Order" chung chung, Ngân hàng phát hành mất quyền kiểm soát hàng hóa và có thể từ chối giảm tỷ lệ ký quỹ.',
          'Ghi rõ: MADE OUT TO THE ORDER OF [ISSUING BANK NAME] AND NOTIFY APPLICANT.'
        );
      }
    }

    // 8. Kiểm tra Thời hạn xuất trình chứng từ Trường 48 cho tuyến ngắn châu Á
    const days48 = parseNumberSafe(lcData.field48 || 21);
    if (isShortSeaRoute(lcData.portOfLoading) && days48 >= 21) {
      add(
        'WARNING',
        'SHORT_SEA_LONG_PRESENTATION',
        'Thực tiễn Logistics Cảng biển Việt Nam',
        `Cảng xếp hàng (${lcData.portOfLoading}) thuộc tuyến ngắn nhưng Trường 48 để tới ${days48} ngày`,
        'Tàu từ Trung Quốc/Hàn Quốc/Nhật Bản/ASEAN về Việt Nam chỉ mất 3–10 ngày. Nếu cho phép người bán nộp chứng từ tới 21 ngày sau ngày giao hàng, hàng sẽ nằm cảng chờ chứng từ gây tốn nặng phí lưu container/lưu bãi (DEM/DET).',
        'Khuyến nghị rút Trường 48 xuống còn 10–14 ngày (hoặc bổ sung điều kiện gửi bản sao chứng từ qua email sớm).'
      );
    }

    // 9. Kiểm tra Điều khoản Phí Bất hợp lệ (Discrepancy Fee) trong Trường 47A
    if (!f47.includes('DISCREPANCY') && !f47.includes('DISCREPANT')) {
      add(
        'WARNING',
        'MISSING_DISCREPANCY_FEE',
        'Thông lệ Ngân hàng Tài trợ Thương mại',
        'Trường 47A chưa quy định khấu trừ Phí Bất hợp lệ (Discrepancy Fee) về phía người bán',
        'Theo mặc định, nếu người bán nộp chứng từ sai và bạn chấp nhận bỏ qua lỗi, ngân hàng nước ngoài có thể đẩy phí kiểm tra/điện phí về phía người mở L/C nếu 47A không quy định rõ.',
        'Thêm điều khoản vào 47A: "A DISCREPANCY FEE OF USD 80.00 SHALL BE DEDUCTED FROM THE PROCEEDS FOR EACH PRESENTATION OF DISCREPANT DOCUMENTS."'
      );
    }

    // 10. Kiểm tra L/C Không hủy ngang (Điều 3 UCP 600)
    const form40A = (lcData.form40A || 'IRREVOCABLE').toUpperCase();
    if (!form40A.includes('IRREVOCABLE')) {
      add(
        'ERROR',
        'NOT_IRREVOCABLE',
        'UCP 600 Điều 3',
        'Loại L/C (40A) bắt buộc phải là IRREVOCABLE',
        'UCP 600 đã loại bỏ khái niệm L/C có thể hủy ngang (Revocable). Mọi L/C theo UCP 600 đều mặc định không hủy ngang.',
        'Chọn IRREVOCABLE cho Trường 40A.'
      );
    }

    // 11. Kiểm tra Dung sai (39A)
    const tolPlus = parseNumberSafe(lcData.tolerancePlus || 0);
    const tolMinus = parseNumberSafe(lcData.toleranceMinus || 0);
    if (tolPlus > 10 || tolMinus > 10) {
      add(
        'WARNING',
        'HIGH_TOLERANCE',
        'UCP 600 Điều 30',
        `Dung sai Trường 39A khá lớn (+${tolPlus}% / -${tolMinus}%)`,
        'Dung sai trên 10% làm tăng mức phong tỏa hạn mức/ký quỹ và gây rủi ro người bán giao thừa/thiếu quá nhiều so với kế hoạch sản xuất.',
        'Thông thường chỉ nên để dung sai 0/0 hoặc 5/5 (tối đa 10/10 đối với hàng rời).'
      );
    }

    // 12. Kiểm tra Tài chính Ký quỹ
    const depPct = parseNumberSafe(lcData.depositPercent !== undefined ? lcData.depositPercent : 100);
    if (depPct < 100 && (!lcData.creditFacilityRef || String(lcData.creditFacilityRef).trim() === '')) {
      add(
        'WARNING',
        'PARTIAL_DEPOSIT_NO_LIMIT_REF',
        'Quy chế Phát hành L/C Ngân hàng TMCP VN',
        `Ký quỹ ${depPct}% (<100%) nhưng chưa nhập Số Hợp đồng Hạn mức Tín dụng / Tài sản bảo đảm`,
        'Ngân hàng chỉ cho phép ký quỹ dưới 100% khi doanh nghiệp đã có Hợp đồng cấp hạn mức tín dụng/tài sản bảo đảm được phê duyệt.',
        'Nhập Số Hợp đồng Cấp tín dụng / Thế chấp hoặc chuyển tỷ lệ ký quỹ về 100%.'
      );
    }

    // 13. Kiểm tra SWIFT Character Set
    const swiftFieldsToCheck = [
      { name: 'Số L/C (20)', text: lcData.lcNumber },
      { name: 'Applicant (50)', text: (lcData.applicantName || '') + ' ' + (lcData.applicantAddress || '') },
      { name: 'Beneficiary (59)', text: (lcData.beneficiaryName || '') + ' ' + (lcData.beneficiaryAddress || '') },
      { name: 'Port of Loading (44E)', text: lcData.portOfLoading },
      { name: 'Port of Discharge (44F)', text: lcData.portOfDischarge }
    ];
    for (const item of swiftFieldsToCheck) {
      const chk = checkSwiftCharacterSet(item.text);
      if (!chk.isValid) {
        add(
          'WARNING',
          'SWIFT_CHARSET_WARNING',
          'SWIFT X-Character Set Standard',
          `Trường ${item.name} chứa ký tự ngoài bộ mã SWIFT chuẩn (${chk.invalidChars.join(' ')})`,
          'Các ký tự tiếng Việt có dấu hoặc ký tự đặc biệt có thể bị hệ thống Gateway SWIFT từ chối hoặc chuyển đổi thành dấu chấm hỏi (?).',
          'Khuyến nghị dùng tiếng Anh không dấu hoặc thay thế các ký tự đặc biệt theo chuẩn SWIFT X-set.'
        );
      }
    }

    const errors = findings.filter(f => f.severity === 'ERROR').length;
    const warnings = findings.filter(f => f.severity === 'WARNING').length;
    const passes = findings.filter(f => f.severity === 'PASS').length;

    return {
      findings,
      summary: {
        errors,
        warnings,
        passes,
        canIssue: errors === 0,
        riskLevel: errors > 0 ? 'BLOCKED' : warnings > 0 ? 'REVIEW_RECOMMENDED' : 'COMPLIANT'
      }
    };
  }

  function generateSwiftMT700(lcData) {
    const bank = getBankInfo(lcData);
    const senderBic = bank.bic;
    const receiverBic = (lcData.advisingBankBic || 'SMBCJPJTXXXX').toUpperCase().padEnd(11, 'X').slice(0, 11);
    const currency = (lcData.currency || 'USD').toUpperCase();
    const swiftAmt = formatSwiftAmount(parseNumberSafe(lcData.amount));
    const tolP = pad2(Math.round(parseNumberSafe(lcData.tolerancePlus || 0)));
    const tolM = pad2(Math.round(parseNumberSafe(lcData.toleranceMinus || 0)));
    const tolLine = (Number(tolP) > 0 || Number(tolM) > 0) ? `:39A:${tolP}/${tolM}\n` : '';

    const availBic = (lcData.availableWithBic || receiverBic).toUpperCase();
    const availBy = (lcData.availableBy || 'BY PAYMENT').toUpperCase();
    const draftTenor = (lcData.draftTenor || 'AT SIGHT').toUpperCase();
    const draweeBic = (lcData.draweeBic || bank.shortBic + 'XXX').toUpperCase();

    const lines = [];
    lines.push(`{1:F01${senderBic}0000000000}{2:I700${receiverBic}N}{3:{108:${lcData.lcNumber || 'MT700SIM'}}}`);
    lines.push('{4:');
    lines.push(':27:1/1');
    lines.push(`:40A:${(lcData.form40A || 'IRREVOCABLE').toUpperCase()}`);
    lines.push(`:20:${(lcData.lcNumber || 'LC2026VCB0001').toUpperCase()}`);
    lines.push(`:31C:${toSwiftDate(lcData.issueDate)}`);
    lines.push(':40E:UCP LATEST VERSION');
    lines.push(`:31D:${toSwiftDate(lcData.expiryDate)}${(lcData.expiryPlace || 'AT BENEFICIARY COUNTRY').toUpperCase()}`);
    lines.push(`:50:${extractLineTokens((lcData.applicantName || '') + '\n' + (lcData.applicantAddress || ''), 35).toUpperCase()}`);
    lines.push(`:59:${extractLineTokens((lcData.beneficiaryName || '') + '\n' + (lcData.beneficiaryAddress || ''), 35).toUpperCase()}`);
    lines.push(`:32B:${currency}${swiftAmt}`);
    if (tolLine) lines.push(tolLine.trimEnd());
    lines.push(`:41A:${availBic}\n${availBy}`);
    lines.push(`:42C:${draftTenor}`);
    lines.push(`:42A:${draweeBic}`);
    lines.push(`:43P:${(lcData.partialShipment || 'NOT ALLOWED').toUpperCase()}`);
    lines.push(`:43T:${(lcData.transhipment || 'ALLOWED').toUpperCase()}`);
    if (lcData.placeOfTakingInCharge) {
      lines.push(`:44A:${lcData.placeOfTakingInCharge.toUpperCase()}`);
    }
    lines.push(`:44E:${(lcData.portOfLoading || '').toUpperCase()}`);
    lines.push(`:44F:${(lcData.portOfDischarge || '').toUpperCase()}`);
    if (lcData.placeOfFinalDestination) {
      lines.push(`:44B:${lcData.placeOfFinalDestination.toUpperCase()}`);
    }
    lines.push(`:44C:${toSwiftDate(lcData.latestShipmentDate)}`);
    lines.push(`:45A:${extractLineTokens((lcData.field45A || '').toUpperCase(), 65)}`);
    lines.push(`:46A:${extractLineTokens((lcData.field46A || '').toUpperCase(), 65)}`);
    lines.push(`:47A:${extractLineTokens((lcData.field47A || '').toUpperCase(), 65)}`);
    lines.push(`:71D:${(lcData.field71D || 'ALL BANKING CHARGES OUTSIDE VIETNAM ARE FOR BENEFICIARY ACCOUNT.').toUpperCase()}`);
    lines.push(`:48:${pad2(parseNumberSafe(lcData.field48 || 21))}/FROM SHIPMENT DATE`);
    lines.push(`:49:${(lcData.field49 || 'WITHOUT').toUpperCase()}`);
    lines.push(`:78:${extractLineTokens((lcData.field78 || '').toUpperCase(), 65)}`);
    if (lcData.advisingBankName) {
      lines.push(`:57A:${receiverBic}`);
    }
    lines.push('-}');
    return lines.join('\n');
  }

  function toMmDdYyyySlash(isoDate) {
    if (!isoDate) return '';
    const m = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoDate;
    return `${m[2]}/${m[3]}/${m[1]}`;
  }

  function cleanHtmlEntities(text) {
    return String(text || '')
      .replace(/&bull;|bull;/gi, '• ')
      .replace(/&ndash;|ndash;/gi, '-')
      .replace(/&rsquo;|rsquo;/gi, "'")
      .replace(/&nbsp;|nbsp;/gi, ' ')
      .replace(/[ \t]{2,}/g, ' ');
  }

  function indentLines(text, prefix) {
    const pad = prefix !== undefined ? prefix : '    ';
    const raw = cleanHtmlEntities(text).trim();
    if (!raw) return pad;
    return raw
      .split(/\r?\n/)
      .map(line => pad + line.trimEnd())
      .join('\n');
  }

  function getBankEnglishHeader(bank) {
    const map = {
      VCB: {
        enName: 'JOINT STOCK COMMERCIAL BANK FOR FOREIGN TRADE OF VIETNAM',
        addr1: '198 TRAN QUANG KHAI STREET, HOAN KIEM DISTRICT',
        addr2: 'HANOI, VIETNAM'
      },
      BIDV: {
        enName: 'JOINT STOCK COMMERCIAL BANK FOR INVESTMENT AND DEVELOPMENT OF VIETNAM',
        addr1: 'BIDV TOWER, 194 TRAN QUANG KHAI STREET',
        addr2: 'HOAN KIEM DISTRICT, HANOI, VIETNAM'
      },
      VTB: {
        enName: 'VIETNAM JOINT STOCK COMMERCIAL BANK FOR INDUSTRY AND TRADE',
        addr1: '108 TRAN HUNG DAO STREET, HOAN KIEM DISTRICT',
        addr2: 'HANOI, VIETNAM'
      },
      TCB: {
        enName: 'VIETNAM TECHNOLOGICAL AND COMMERCIAL JOINT STOCK BANK',
        addr1: '6 QUANG TRUNG STREET, HOAN KIEM DISTRICT',
        addr2: 'HANOI, VIETNAM'
      },
      ACB: {
        enName: 'ASIA COMMERCIAL JOINT STOCK BANK',
        addr1: '442 NGUYEN THI MINH KHAI STREET, DISTRICT 3',
        addr2: 'HO CHI MINH CITY, VIETNAM'
      },
      MB: {
        enName: 'MILITARY COMMERCIAL JOINT STOCK BANK',
        addr1: '18 LE VAN LUONG STREET, CAU GIAY DISTRICT',
        addr2: 'HANOI, VIETNAM'
      },
      STB: {
        enName: 'SAIGON THUONG TIN COMMERCIAL JOINT STOCK BANK',
        addr1: '266-268 NAM KY KHOI NGHIA STREET, DISTRICT 3',
        addr2: 'HO CHI MINH CITY, VIETNAM'
      },
      VPB: {
        enName: 'VIETNAM PROSPERITY JOINT STOCK COMMERCIAL BANK',
        addr1: '89 LANG HA STREET, DONG DA DISTRICT',
        addr2: 'HANOI, VIETNAM'
      },
      EIB: {
        enName: 'VIETNAM EXPORT IMPORT COMMERCIAL JOINT STOCK BANK',
        addr1: 'VINCOM CENTER, 72 LE THANH TON STREET, DISTRICT 1',
        addr2: 'HO CHI MINH CITY, VIETNAM'
      }
    };
    if (map[bank.code]) return map[bank.code];
    return {
      enName: (bank.name || 'COMMERCIAL BANK OF VIETNAM').toUpperCase(),
      addr1: (bank.branch || 'HEAD OFFICE').toUpperCase(),
      addr2: (bank.address || 'HO CHI MINH CITY, VIETNAM').toUpperCase()
    };
  }

  /**
   * Xuất Bản in giấy giải mã chuẩn thực tế của Bức điện SWIFT FIN 700
   * (Message Header -> Sender -> Receiver -> Message Text -> Tên trường đầy đủ -> Message End)
   */
  function generateSwiftPrintedMT700(lcData) {
    const bank = getBankInfo(lcData);
    const bankEn = getBankEnglishHeader(bank);
    const senderShortBic = (bank.shortBic || bank.bic.slice(0, 8)).toUpperCase();
    const receiverShortBic = (lcData.advisingBankBic || 'SMBCJPJT').toUpperCase().replace(/X+$/, '').slice(0, 8) || 'SMBCJPJT';
    const receiverName = (lcData.advisingBankName || 'ADVISING BANK').toUpperCase();

    const benAddr = (lcData.beneficiaryAddress || '').trim();
    const benCountryMatch = benAddr.split(',').map(s => s.trim()).filter(Boolean);
    const receiverLocation = benCountryMatch.length >= 2
      ? benCountryMatch.slice(-2).join('\n           ').toUpperCase()
      : (benCountryMatch[0] || 'OVERSEAS BRANCH').toUpperCase();

    const currency = (lcData.currency || 'USD').toUpperCase();
    const amountNum = parseNumberSafe(lcData.amount);
    const formattedAmt = formatHumanAmount(amountNum, '');
    const tolP = Math.round(parseNumberSafe(lcData.tolerancePlus || 0));
    const tolM = Math.round(parseNumberSafe(lcData.toleranceMinus || 0));

    const availBy = (lcData.availableBy || 'BY NEGOTIATION').toUpperCase();
    const rawTenor = (lcData.draftTenor || 'AT SIGHT').trim();
    const draftTenorDisplay = /^AT\s+SIGHT$/i.test(rawTenor) ? 'Sight' : rawTenor.toUpperCase();
    const draweeShortBic = (lcData.draweeBic || senderShortBic).toUpperCase().replace(/X+$/, '') || senderShortBic;
    const days48 = parseNumberSafe(lcData.field48 || 14);

    const applicantLines = [
      (lcData.applicantName || '').toUpperCase(),
      ...extractLineTokens((lcData.applicantAddress || '').toUpperCase(), 55).split('\n').filter(Boolean),
      !/VIET\s*NAM/i.test(lcData.applicantAddress || '') ? 'VIETNAM' : ''
    ].filter(Boolean).join('\n');

    const beneficiaryLines = [
      (lcData.beneficiaryName || '').toUpperCase(),
      ...extractLineTokens((lcData.beneficiaryAddress || ''), 60).split('\n').filter(Boolean)
    ].filter(Boolean).join('\n');

    const f45Text = extractLineTokens(lcData.field45A || lcData.goodsDescription || '', 68);
    const f46Text = extractLineTokens(lcData.field46A || '', 68);
    const f47Text = extractLineTokens(lcData.field47A || '', 68);
    const f71Text = extractLineTokens(
      lcData.field71D || "ISSUING BANK'S CHARGES ARE FOR THE ACCOUNT OF APPLICANT. ALL CHARGES RELATING TO PAYMENT, REIMBURSEMENT AND OTHER BANKS' CHARGES ARE FOR THE ACCOUNT OF BENEFICIARY.",
      65
    );
    const f78Text = extractLineTokens(
      lcData.field78 || 'THE REQUIRED DOCUMENTS WHICH ARE COMPLIED WITH THE TERMS AND CONDITIONS OF THIS CREDIT, WE WILL MAKE PAYMENTS/ ACCEPTANCES AS INSTRUCTIONS OF PAYING/ ACCEPTING/ NEGOTIATING BANK',
      65
    );

    const out = [];
    out.push('--------------------------- Message Header ---------------------------');
    out.push('Swift Input:                FIN 700 Issue of a Documentary Credit');
    out.push(`Sender   : ${senderShortBic}`);
    out.push(`           ${bankEn.enName}`);
    out.push(`           ${bankEn.addr1}`);
    out.push(`           ${bankEn.addr2}`);
    out.push('');
    out.push(`Receiver : ${receiverShortBic}`);
    out.push(`           ${receiverName}`);
    out.push(`           ${receiverLocation}`);
    out.push('--------------------------- Message Text -----------------------------');
    out.push('27: Sequence of Total');
    out.push('    1/1');
    out.push('40A: Form of Documentary Credit');
    out.push(`    ${(lcData.form40A || 'IRREVOCABLE').toUpperCase()}`);
    out.push('20: Documentary Credit Number');
    out.push(`    ${(lcData.lcNumber || 'TF-26220-12839I').toUpperCase()}`);
    out.push('31C: Date of Issue');
    out.push(`    ${toMmDdYyyySlash(lcData.issueDate)}`);
    out.push('40E: Applicable Rules');
    out.push('    UCP LATEST VERSION');
    out.push('31D: Date and Place of Expiry');
    out.push(`    ${toMmDdYyyySlash(lcData.expiryDate)} ${lcData.expiryPlace || 'AT BENEFICIARY COUNTRY'}`);
    out.push('50: Applicant');
    out.push(indentLines(applicantLines, '    '));
    out.push('59: Beneficiary - Name & Address');
    out.push(indentLines(beneficiaryLines, '    '));
    out.push('32B: Currency Code, Amount');
    out.push(`    Currency: ${currency}`);
    out.push(`    Amount : ${formattedAmt}`);
    out.push('39A: Percentage Credit Amt Tolerance');
    out.push(`    ${tolP} / ${tolM}`);
    out.push('41A: Available With');
    out.push('');
    out.push(`    ${availBy}`);
    out.push('42C: Drafts at...');
    out.push(`    ${draftTenorDisplay}`);
    out.push('42A: Drawee');
    out.push(`    ${draweeShortBic}`);
    out.push(`    ${bankEn.enName}`);
    out.push('43P: Partial Shipments');
    out.push(`    ${(lcData.partialShipment || 'NOT ALLOWED').toUpperCase()}`);
    out.push('43T: Transhipment');
    out.push(`    ${(lcData.transhipment || 'ALLOWED').toUpperCase()}`);
    out.push('');
    out.push('44E: Port of Loading/Airport of Dep.');
    out.push(`    ${lcData.portOfLoading || ''}`);
    out.push('44F: Port of Dischrge/Airport of Dest');
    out.push(`    ${lcData.portOfDischarge || ''}`);
    out.push('44C: Latest Date of Shipment');
    out.push(`    ${toMmDdYyyySlash(lcData.latestShipmentDate)}`);
    out.push('');
    out.push('45A: Description of Goods/Services');
    out.push(indentLines(f45Text, '    '));
    out.push('46A: Documents Required');
    out.push(indentLines(f46Text, '    '));
    out.push('47A: Additional Conditions');
    out.push(indentLines(f47Text, '    '));
    out.push('71B: Charges');
    out.push(indentLines(f71Text, '    '));
    out.push('48: Period for Presentation');
    out.push(`    WITHIN ${days48} DAYS AFTER B/L DATE BUT WITHIN THE VALIDITY OF THE LC`);
    out.push('49: Confirmation Instructions');
    out.push(`    ${(lcData.field49 || 'WITHOUT').toUpperCase()}`);
    out.push('');
    out.push('');
    out.push('78: Instr to Payg/Accptg/Negotg Bank');
    out.push(indentLines(f78Text, '    '));
    out.push('');
    out.push('');
    out.push('72: Sender to Receiver Information');
    out.push('    PLEASE ACKNOWLEDGE YOUR RECEIPT OF THIS L/C BY MT730.');
    out.push('');
    out.push('--------------------------- Message End-------------------------------');

    return out.join('\n');
  }

  function generateSwiftMT707(baseLcData, amendment) {
    const bank = getBankInfo(baseLcData);
    const senderBic = bank.bic;
    const receiverBic = (baseLcData.advisingBankBic || 'SMBCJPJTXXXX').toUpperCase().padEnd(11, 'X').slice(0, 11);
    const currency = (baseLcData.currency || 'USD').toUpperCase();
    const baseAmt = parseNumberSafe(baseLcData.amount);
    const newAmt = amendment.newAmount !== undefined && amendment.newAmount !== '' ? parseNumberSafe(amendment.newAmount) : baseAmt;
    const delta = newAmt - baseAmt;

    const lines = [];
    lines.push(`{1:F01${senderBic}0000000000}{2:I707${receiverBic}N}{3:{108:${baseLcData.lcNumber || 'MT707SIM'}}}`);
    lines.push('{4:');
    lines.push(':27:1/1');
    lines.push(`:20:${(baseLcData.lcNumber || '').toUpperCase()}`);
    lines.push(`:21:${(amendment.relatedReference || 'AMEND-' + pad2(amendment.amendmentNumber || 1)).toUpperCase()}`);
    lines.push(`:23:ISSUANCE`);
    lines.push(`:52A:${bank.shortBic}XXX`);
    lines.push(`:31C:${toSwiftDate(baseLcData.issueDate)}`);
    lines.push(`:30:${toSwiftDate(amendment.amendmentDate || new Date().toISOString().slice(0, 10))}`);
    lines.push(`:26E:${amendment.amendmentNumber || 1}`);
    lines.push(`:59:${(baseLcData.beneficiaryName || '').toUpperCase()}`);

    if (amendment.newExpiryDate && amendment.newExpiryDate !== baseLcData.expiryDate) {
      lines.push(`:31E:${toSwiftDate(amendment.newExpiryDate)}`);
    }

    if (Math.abs(delta) > 0.001) {
      if (delta > 0) {
        lines.push(`:32B:${currency}${formatSwiftAmount(delta)}`);
      } else {
        lines.push(`:33B:${currency}${formatSwiftAmount(Math.abs(delta))}`);
      }
      lines.push(`:34B:${currency}${formatSwiftAmount(newAmt)}`);
    }

    if (amendment.newPortOfLoading && amendment.newPortOfLoading.trim() !== '') {
      lines.push(`:44E:${amendment.newPortOfLoading.toUpperCase()}`);
    }
    if (amendment.newPortOfDischarge && amendment.newPortOfDischarge.trim() !== '') {
      lines.push(`:44F:${amendment.newPortOfDischarge.toUpperCase()}`);
    }
    if (amendment.newLatestShipmentDate && amendment.newLatestShipmentDate !== baseLcData.latestShipmentDate) {
      lines.push(`:44C:${toSwiftDate(amendment.newLatestShipmentDate)}`);
    }
    if (amendment.field45B && amendment.field45B.trim() !== '') {
      lines.push(`:45B:${extractLineTokens(amendment.field45B.toUpperCase(), 65)}`);
    }
    if (amendment.field46B && amendment.field46B.trim() !== '') {
      lines.push(`:46B:${extractLineTokens(amendment.field46B.toUpperCase(), 65)}`);
    }
    if (amendment.field47B && amendment.field47B.trim() !== '') {
      lines.push(`:47B:${extractLineTokens(amendment.field47B.toUpperCase(), 65)}`);
    }
    lines.push(':72Z:/BENCON/ALL OTHER TERMS AND CONDITIONS REMAIN UNCHANGED.');
    lines.push('-}');

    const effectiveLC = Object.assign({}, baseLcData);
    if (amendment.newExpiryDate) effectiveLC.expiryDate = amendment.newExpiryDate;
    if (Math.abs(delta) > 0.001) effectiveLC.amount = newAmt;
    if (amendment.newPortOfLoading) effectiveLC.portOfLoading = amendment.newPortOfLoading;
    if (amendment.newPortOfDischarge) effectiveLC.portOfDischarge = amendment.newPortOfDischarge;
    if (amendment.newLatestShipmentDate) effectiveLC.latestShipmentDate = amendment.newLatestShipmentDate;
    if (amendment.field45B && amendment.field45B.trim()) {
      effectiveLC.field45A = (effectiveLC.field45A || '') + '\n[AMENDED 45B]: ' + amendment.field45B.trim();
    }
    if (amendment.field46B && amendment.field46B.trim()) {
      effectiveLC.field46A = (effectiveLC.field46A || '') + '\n[AMENDED 46B]: ' + amendment.field46B.trim();
    }
    if (amendment.field47B && amendment.field47B.trim()) {
      effectiveLC.field47A = (effectiveLC.field47A || '') + '\n[AMENDED 47B]: ' + amendment.field47B.trim();
    }

    return {
      mt707Text: lines.join('\n'),
      deltaAmount: delta,
      newAmount: newAmt,
      additionalDepositForeign: delta > 0 ? delta * (parseNumberSafe(baseLcData.depositPercent !== undefined ? baseLcData.depositPercent : 100) / 100) : 0,
      effectiveLC
    };
  }

  function checkDocumentDiscrepancies(effectiveLC, docs) {
    const discrepancies = [];
    const checksPassed = [];
    const bank = getBankInfo(effectiveLC);

    const inv = docs.invoice || {};
    const bl = docs.billOfLading || {};
    const pl = docs.packingList || {};
    const draft = docs.draft || {};
    const co = docs.certificateOfOrigin || {};
    const ins = docs.insurance || {};

    const lcAmount = parseNumberSafe(effectiveLC.amount);
    const tolPlus = parseNumberSafe(effectiveLC.tolerancePlus || 0);
    const tolMinus = parseNumberSafe(effectiveLC.toleranceMinus || 0);
    const maxLcAmt = lcAmount * (1 + tolPlus / 100);
    const minLcAmt = lcAmount * (1 - tolMinus / 100);
    const lcCurrency = (effectiveLC.currency || 'USD').toUpperCase();
    const incoterm = (effectiveLC.incoterms || 'CIF').toUpperCase();
    const f46 = (effectiveLC.field46A || '').toUpperCase();
    const f45 = (effectiveLC.field45A || '').toUpperCase();
    const presentationDays = parseNumberSafe(effectiveLC.field48 || 21);

    function addDisc(code, article, docName, title, expected, actual, impact) {
      discrepancies.push({ code, article, docName, title, expected, actual, impact });
    }
    function addPass(article, docName, title, note) {
      checksPassed.push({ article, docName, title, note });
    }

    // 1. Kiểm tra L/C Reference trên chứng từ
    if (inv.lcNumber && effectiveLC.lcNumber && inv.lcNumber.trim().toUpperCase() !== effectiveLC.lcNumber.trim().toUpperCase()) {
      addDisc(
        'INV_LC_NO_MISMATCH',
        'UCP 600 Điều 14(d) & Điều khoản 47A',
        'Commercial Invoice',
        'Số L/C trên Hóa đơn thương mại không khớp',
        effectiveLC.lcNumber,
        inv.lcNumber,
        'Sai tham chiếu L/C (có thể sửa lại trước khi chấp nhận).'
      );
    }

    // 2. Kiểm tra Ngày phát hành chứng từ không được trước Ngày mở L/C
    if (inv.date && effectiveLC.issueDate && diffDaysIso(inv.date, effectiveLC.issueDate) < 0) {
      addDisc(
        'DOC_DATED_BEFORE_LC',
        'Điều khoản 47A L/C',
        'Commercial Invoice',
        'Hóa đơn phát hành trước ngày mở L/C',
        `>= ${effectiveLC.issueDate}`,
        inv.date,
        'Vi phạm quy định tại Trường 47A ("Documents dated prior to L/C issuance date are not acceptable").'
      );
    }

    // 3. Kiểm tra Giao hàng trễ (Late Shipment)
    if (bl.onBoardDate && effectiveLC.latestShipmentDate) {
      const lateDays = diffDaysIso(bl.onBoardDate, effectiveLC.latestShipmentDate);
      if (lateDays > 0) {
        addDisc(
          'LATE_SHIPMENT',
          'UCP 600 Điều 20(a)(ii) & Trường 44C',
          'Bill of Lading (B/L)',
          `Giao hàng trễ (Late Shipment) ${lateDays} ngày so với hạn 44C`,
          `On Board <= ${effectiveLC.latestShipmentDate}`,
          `Shipped on Board: ${bl.onBoardDate}`,
          'Lỗi nghiêm trọng: Ngân hàng có quyền từ chối thanh toán toàn bộ bộ chứng từ.'
        );
      } else {
        addPass('UCP 600 Điều 20', 'Bill of Lading', 'Ngày giao hàng lên tàu (On Board) hợp lệ', `Ngày giao ${bl.onBoardDate} <= 44C (${effectiveLC.latestShipmentDate}).`);
      }
    }

    // 4. Kiểm tra Xuất trình trễ & Hết hạn L/C
    const presDate = docs.presentationDate || '';
    if (presDate && effectiveLC.expiryDate) {
      const overExp = diffDaysIso(presDate, effectiveLC.expiryDate);
      if (overExp > 0) {
        addDisc(
          'CREDIT_EXPIRED',
          'UCP 600 Điều 6(d) & Trường 31D',
          'Toàn bộ Bộ chứng từ',
          `Xuất trình chứng từ sau khi L/C đã hết hiệu lực ${overExp} ngày`,
          `<= ${effectiveLC.expiryDate}`,
          presDate,
          'L/C đã hết hạn, Ngân hàng phát hành hết nghĩa vụ cam kết thanh toán.'
        );
      }
    }
    if (presDate && bl.onBoardDate) {
      const daysSinceShip = diffDaysIso(presDate, bl.onBoardDate);
      if (daysSinceShip > presentationDays) {
        addDisc(
          'LATE_PRESENTATION',
          'UCP 600 Điều 14(c) & Trường 48',
          'Toàn bộ Bộ chứng từ',
          `Xuất trình chứng từ trễ (Late Presentation: ${daysSinceShip} ngày > ${presentationDays} ngày)`,
          `Trong vòng ${presentationDays} ngày sau ${bl.onBoardDate}`,
          `Ngày xuất trình ${presDate} (${daysSinceShip} ngày)`,
          'Vi phạm thời hạn xuất trình tại Trường 48.'
        );
      } else if (daysSinceShip >= 0) {
        addPass('UCP 600 Điều 14(c)', 'Xuất trình chứng từ', 'Thời hạn xuất trình đúng hạn Trường 48', `${daysSinceShip} ngày sau On Board <= ${presentationDays} ngày.`);
      }
    }

    // 5. Kiểm tra Số tiền trên Invoice & Hối phiếu
    const invAmt = parseNumberSafe(inv.amount);
    if (invAmt > 0 && lcAmount > 0) {
      if (invAmt > maxLcAmt + 0.01) {
        addDisc(
          'OVERDRAWN_INVOICE',
          'UCP 600 Điều 18(b) & 30',
          'Commercial Invoice',
          'Trị giá Hóa đơn vượt quá Số tiền tối đa của L/C',
          `<= ${formatHumanAmount(maxLcAmt, lcCurrency)} (gồm dung sai +${tolPlus}%)`,
          formatHumanAmount(invAmt, inv.currency || lcCurrency),
          'Ngân hàng từ chối thanh toán do rút vượt hạn mức L/C.'
        );
      } else if (invAmt < minLcAmt - 0.01 && (effectiveLC.partialShipment || '').toUpperCase() === 'NOT ALLOWED') {
        addDisc(
          'UNDERDRAWN_NO_PARTIAL',
          'UCP 600 Điều 30',
          'Commercial Invoice',
          'Trị giá Hóa đơn thấp hơn mức dung sai tối thiểu khi không cho giao từng phần',
          `>= ${formatHumanAmount(minLcAmt, lcCurrency)}`,
          formatHumanAmount(invAmt, inv.currency || lcCurrency),
          'Giao thiếu hàng vượt quá mức dung sai cho phép.'
        );
      } else {
        addPass('UCP 600 Điều 18(b)', 'Commercial Invoice', 'Số tiền Hóa đơn nằm trong hạn mức L/C', `${formatHumanAmount(invAmt, lcCurrency)} hợp lệ.`);
      }
    }

    const draftAmt = parseNumberSafe(draft.amount);
    if (draftAmt > 0 && invAmt > 0 && Math.abs(draftAmt - invAmt) > 0.01) {
      addDisc(
        'DRAFT_INVOICE_MISMATCH',
        'UCP 600 Điều 14(d) & ISBP 745 B12',
        'Bill of Exchange (Hối phiếu)',
        'Số tiền trên Hối phiếu không khớp số tiền Hóa đơn thương mại',
        formatHumanAmount(invAmt, lcCurrency),
        formatHumanAmount(draftAmt, draft.currency || lcCurrency),
        'Mâu thuẫn số tiền đòi thanh toán giữa Hối phiếu và Hóa đơn.'
      );
    }

    // 6. Kiểm tra Mô tả hàng hóa trên Commercial Invoice
    if (inv.goodsDescription && f45) {
      const invDesc = inv.goodsDescription.toUpperCase();
      const firstLine45 = f45.split('\n')[0].replace(/[^\w\s]/g, ' ');
      const tokens = firstLine45.split(/\s+/).filter(w => w.length >= 4 && !['WITH', 'FROM', 'MODEL', 'GOODS', 'TERMS', 'BRAND', 'ORIGIN', 'PACKING'].includes(w));
      const keyTokens = tokens.slice(0, 6);
      const missingTokens = keyTokens.filter(t => !invDesc.includes(t));
      if (keyTokens.length >= 2 && missingTokens.length > Math.floor(keyTokens.length / 2)) {
        addDisc(
          'GOODS_DESCRIPTION_MISMATCH',
          'UCP 600 Điều 18(c)',
          'Commercial Invoice',
          'Mô tả hàng hóa trên Hóa đơn không tương ứng với Trường 45A',
          f45.split('\n')[0],
          inv.goodsDescription,
          'Điều 18(c) yêu cầu mô tả hàng hóa trên Commercial Invoice phải tương ứng (correspond) với mô tả trong L/C.'
        );
      } else {
        addPass('UCP 600 Điều 18(c)', 'Commercial Invoice', 'Mô tả hàng hóa tương ứng với Trường 45A', 'Khớp tên hàng và quy cách chính.');
      }
    }

    // 7. Kiểm tra Vận đơn
    if (bl.portOfLoading && effectiveLC.portOfLoading) {
      const polLc = effectiveLC.portOfLoading.toUpperCase().split(',')[0].replace(/\bPORT\b/g, '').trim();
      const polBl = bl.portOfLoading.toUpperCase();
      if (polLc && !polBl.includes(polLc)) {
        addDisc(
          'POL_MISMATCH',
          'UCP 600 Điều 20(a)(iii) & Trường 44E',
          'Bill of Lading (B/L)',
          'Cảng xếp hàng (Port of Loading) trên Vận đơn sai lệch Trường 44E',
          effectiveLC.portOfLoading,
          bl.portOfLoading,
          'Xếp hàng sai cảng quy định trong L/C.'
        );
      }
    }

    if (bl.portOfDischarge && effectiveLC.portOfDischarge) {
      const podLc = effectiveLC.portOfDischarge.toUpperCase().split(',')[0].replace(/\bPORT\b/g, '').trim();
      const podBl = bl.portOfDischarge.toUpperCase();
      if (podLc && !podBl.includes(podLc)) {
        addDisc(
          'POD_MISMATCH',
          'UCP 600 Điều 20(a)(iii) & Trường 44F',
          'Bill of Lading (B/L)',
          'Cảng dỡ hàng (Port of Discharge) trên Vận đơn sai lệch Trường 44F',
          effectiveLC.portOfDischarge,
          bl.portOfDischarge,
          'Dỡ hàng sai cảng quy định trong L/C.'
        );
      }
    }

    if (bl.cleanOnBoard === false) {
      addDisc(
        'UNCLEAN_BL',
        'UCP 600 Điều 27',
        'Bill of Lading (B/L)',
        'Vận đơn không sạch (Unclean / Claused B/L) hoặc thiếu ghi chú Shipped on Board',
        'Clean Shipped on Board Marine B/L',
        bl.remarks || 'Có ghi chú hư hỏng hoặc thiếu xác nhận On Board',
        'Ngân hàng từ chối vận đơn có ghi chú khiếm khuyết về bao bì/hàng hóa.'
      );
    }

    if (bl.freightTerm) {
      const ft = bl.freightTerm.toUpperCase();
      if (f46.includes('FREIGHT PREPAID') && !ft.includes('PREPAID')) {
        addDisc(
          'FREIGHT_TERM_MISMATCH',
          'UCP 600 Điều 14(d) & Trường 46A',
          'Bill of Lading (B/L)',
          'Điều kiện cước trên B/L sai so với L/C',
          'FREIGHT PREPAID',
          bl.freightTerm,
          'Rủi ro người mua phải chịu thêm cước tàu.'
        );
      } else if (f46.includes('FREIGHT COLLECT') && !ft.includes('COLLECT')) {
        addDisc(
          'FREIGHT_TERM_MISMATCH',
          'UCP 600 Điều 14(d) & Trường 46A',
          'Bill of Lading (B/L)',
          'Điều kiện cước trên B/L sai so với L/C',
          'FREIGHT COLLECT',
          bl.freightTerm,
          'Người bán đánh dấu Prepaid trái điều khoản FOB của L/C.'
        );
      }
    }

    // 8. Kiểm tra Chứng từ Bảo hiểm
    const requiresIns = f46.includes('INSURANCE') || incoterm === 'CIF' || incoterm === 'CIP';
    if (requiresIns) {
      const insAmt = parseNumberSafe(ins.amount);
      if (ins.missing || insAmt <= 0) {
        addDisc(
          'MISSING_INSURANCE_DOC',
          'UCP 600 Điều 28 & Trường 46A',
          'Insurance Policy / Certificate',
          'Thiếu Chứng từ Bảo hiểm theo yêu cầu của L/C',
          'Insurance Policy/Certificate >= 110% Invoice Value',
          'Không xuất trình / Số tiền bảo hiểm = 0',
          'Thiếu chứng từ bắt buộc trong Trường 46A.'
        );
      } else {
        const minInsRequired = Number((invAmt * 1.1).toFixed(2));
        if (invAmt > 0 && insAmt + 0.01 < minInsRequired) {
          addDisc(
            'INSUFFICIENT_INSURANCE_AMOUNT',
            'UCP 600 Điều 28(f)(ii)',
            'Insurance Policy / Certificate',
            'Số tiền bảo hiểm không đạt mức tối thiểu 110% trị giá hóa đơn',
            `>= ${formatHumanAmount(minInsRequired, lcCurrency)} (110% của ${formatHumanAmount(invAmt, lcCurrency)})`,
            formatHumanAmount(insAmt, ins.currency || lcCurrency),
            'Người mua bị thiếu bảo vệ bảo hiểm nếu xảy ra tổn thất hàng hải.'
          );
        } else {
          addPass('UCP 600 Điều 28(f)(ii)', 'Insurance Policy', 'Mức bảo hiểm đạt >= 110% trị giá hóa đơn', `${formatHumanAmount(insAmt, lcCurrency)} >= ${formatHumanAmount(minInsRequired, lcCurrency)}.`);
        }

        if (ins.issueDate && bl.onBoardDate && diffDaysIso(ins.issueDate, bl.onBoardDate) > 0) {
          addDisc(
            'INSURANCE_DATED_AFTER_SHIPMENT',
            'UCP 600 Điều 28(e)',
            'Insurance Policy / Certificate',
            'Ngày phát hành chứng từ bảo hiểm muộn hơn ngày giao hàng lên tàu',
            `<= ${bl.onBoardDate} (hoặc ghi rõ hiệu lực hồi tố từ ngày giao hàng)`,
            `Ngày cấp bảo hiểm: ${ins.issueDate}`,
            'Vi phạm Điều 28(e) UCP 600: Hàng không được bảo hiểm trong thời gian đầu chuyến đi.'
          );
        } else if (ins.issueDate && bl.onBoardDate) {
          addPass('UCP 600 Điều 28(e)', 'Insurance Policy', 'Ngày hiệu lực bảo hiểm hợp lệ', `Ngày bảo hiểm ${ins.issueDate} <= On Board ${bl.onBoardDate}.`);
        }
      }
    }

    // 9. Kiểm tra Nhất quán Trọng lượng & Số lượng kiện
    const weights = [
      { name: 'Bill of Lading', val: parseNumberSafe(bl.grossWeight) },
      { name: 'Packing List', val: parseNumberSafe(pl.grossWeight) },
      { name: 'Certificate of Origin', val: parseNumberSafe(co.grossWeight) }
    ].filter(x => x.val > 0);

    if (weights.length >= 2) {
      const baseW = weights[0].val;
      const conflict = weights.find(x => Math.abs(x.val - baseW) > 0.5);
      if (conflict) {
        addDisc(
          'GROSS_WEIGHT_INCONSISTENCY',
          'UCP 600 Điều 14(d)',
          'Đối chiếu chéo (B/L vs Packing List vs C/O)',
          'Tổng trọng lượng cả bì (Gross Weight) mâu thuẫn giữa các chứng từ',
          weights.map(w => `${w.name}: ${w.val} kg`).join(' | '),
          `Chênh lệch tại ${conflict.name} (${conflict.val} kg so với ${weights[0].name}: ${baseW} kg)`,
          'Vi phạm nguyên tắc không mâu thuẫn dữ liệu giữa các chứng từ (Điều 14d UCP 600).'
        );
      } else {
        addPass('UCP 600 Điều 14(d)', 'Kiểm tra chéo chứng từ', 'Trọng lượng Gross Weight nhất quán giữa B/L, Packing List và C/O', `Đồng nhất ${baseW} kg.`);
      }
    }

    const pkgs = [
      { name: 'Bill of Lading', val: parseNumberSafe(bl.packages) },
      { name: 'Packing List', val: parseNumberSafe(pl.packages) },
      { name: 'Commercial Invoice', val: parseNumberSafe(inv.packages) }
    ].filter(x => x.val > 0);

    if (pkgs.length >= 2) {
      const baseP = pkgs[0].val;
      const conflictP = pkgs.find(x => Math.abs(x.val - baseP) > 0);
      if (conflictP) {
        addDisc(
          'PACKAGE_COUNT_INCONSISTENCY',
          'UCP 600 Điều 14(d)',
          'Đối chiếu chéo (Invoice vs Packing List vs B/L)',
          'Số lượng kiện hàng (Packages/Cartons) không khớp giữa các chứng từ',
          pkgs.map(p => `${p.name}: ${p.val}`).join(' | '),
          `Lệch tại ${conflictP.name}`,
          'Rủi ro vướng thủ tục thông quan Hải quan tại cảng đến và vi phạm Điều 14(d).'
        );
      }
    }

    const isClean = discrepancies.length === 0;
    const statusText = isClean
      ? 'CLEAN PRESENTATION (CHỨNG TỪ HOÀN TOÀN PHÙ HỢP)'
      : `DISCREPANT PRESENTATION (PHÁT HIỆN ${discrepancies.length} LỖI BẤT HỢP LỆ)`;

    const todaySwift = toSwiftDate(new Date().toISOString().slice(0, 10));
    const mt734Lines = [];
    if (!isClean) {
      const receiverBic = (effectiveLC.advisingBankBic || 'SMBCJPJTXXXX').toUpperCase().padEnd(11, 'X').slice(0, 11);
      mt734Lines.push(`{1:F01${bank.bic}0000000000}{2:I734${receiverBic}N}`);
      mt734Lines.push('{4:');
      mt734Lines.push(`:20:${(effectiveLC.lcNumber || '').toUpperCase()}`);
      mt734Lines.push(`:21:${(inv.invoiceNo || 'PRESENTATION-01').toUpperCase()}`);
      mt734Lines.push(`:32A:${todaySwift}${lcCurrency}${formatSwiftAmount(invAmt || lcAmount)}`);
      mt734Lines.push(`:73A:DISCREPANCY FEE USD ${bank.discrepancyFeeUsd},00 PLUS SWIFT CHARGES`);
      mt734Lines.push(':77J:' + discrepancies.map((d, idx) => `${idx + 1}. [${d.docName}] ${d.title} (${d.article}): EXPECTED ${d.expected}, ACTUAL ${d.actual}`.toUpperCase()).join('\n'));
      mt734Lines.push(':77B:HOLD/WE ARE HOLDING DOCUMENTS AT YOUR DISPOSAL PENDING APPLICANT\'S WAIVER.');
      mt734Lines.push('-}');
    }

    return {
      isClean,
      statusText,
      discrepancies,
      checksPassed,
      discrepancyFeeUsd: isClean ? 0 : bank.discrepancyFeeUsd,
      mt734Notice: isClean ? '' : mt734Lines.join('\n')
    };
  }

  return {
    ISSUING_BANKS,
    getBankInfo,
    SWIFT_TOOLTIPS,
    toSwiftDate,
    formatSwiftAmount,
    formatHumanAmount,
    addDaysIso,
    diffDaysIso,
    isShortSeaRoute,
    parseNumberSafe,
    checkSwiftCharacterSet,
    buildDefaultMT700Clauses,
    calculateFinancials,
    validateLCApplication,
    generateSwiftMT700,
    generateSwiftPrintedMT700,
    generateSwiftMT707,
    checkDocumentDiscrepancies
  };
});
