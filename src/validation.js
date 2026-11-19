(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MaritimeValidation = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EQUIPMENT_SPECS = {
    '20GP': {
      code: '20GP',
      isoCode: '22G1',
      label: "20' Standard Dry",
      defaultTareKgm: 2250,
      minTareKgm: 1950,
      maxTareKgm: 2550,
      maxGrossWeightKgm: 30480,
      maxStructuralMgwKgm: 32500,
      maxVolumeCbm: 33.2
    },
    '40GP': {
      code: '40GP',
      isoCode: '42G1',
      label: "40' Standard Dry",
      defaultTareKgm: 3750,
      minTareKgm: 3400,
      maxTareKgm: 4100,
      maxGrossWeightKgm: 30480,
      maxStructuralMgwKgm: 32500,
      maxVolumeCbm: 67.7
    },
    '40HC': {
      code: '40HC',
      isoCode: '45G1',
      label: "40' High Cube Dry",
      defaultTareKgm: 3940,
      minTareKgm: 3600,
      maxTareKgm: 4300,
      maxGrossWeightKgm: 32500,
      maxStructuralMgwKgm: 32500,
      maxVolumeCbm: 76.3
    },
    '20RF': {
      code: '20RF',
      isoCode: '22R1',
      label: "20' Reefer",
      defaultTareKgm: 3080,
      minTareKgm: 2700,
      maxTareKgm: 3400,
      maxGrossWeightKgm: 30480,
      maxStructuralMgwKgm: 32500,
      maxVolumeCbm: 28.4
    },
    '40HR': {
      code: '40HR',
      isoCode: '45R1',
      label: "40' High Cube Reefer",
      defaultTareKgm: 4480,
      minTareKgm: 4100,
      maxTareKgm: 4900,
      maxGrossWeightKgm: 34000,
      maxStructuralMgwKgm: 34000,
      maxVolumeCbm: 67.8
    },
    '20OT': {
      code: '20OT',
      isoCode: '22U1',
      label: "20' Open Top",
      defaultTareKgm: 2360,
      minTareKgm: 2050,
      maxTareKgm: 2650,
      maxGrossWeightKgm: 30480,
      maxStructuralMgwKgm: 32500,
      maxVolumeCbm: 32.5
    },
    '40OT': {
      code: '40OT',
      isoCode: '42U1',
      label: "40' Open Top",
      defaultTareKgm: 4050,
      minTareKgm: 3700,
      maxTareKgm: 4450,
      maxGrossWeightKgm: 30480,
      maxStructuralMgwKgm: 32500,
      maxVolumeCbm: 66.7
    },
    '45HC': {
      code: '45HC',
      isoCode: 'L5G1',
      label: "45' High Cube Dry",
      defaultTareKgm: 4800,
      minTareKgm: 4400,
      maxTareKgm: 5200,
      maxGrossWeightKgm: 32500,
      maxStructuralMgwKgm: 32500,
      maxVolumeCbm: 86.0
    }
  };

  const CARRIER_PROFILES = {
    ONE: {
      code: 'ONE',
      scac: 'ONEY',
      name: 'OCEAN NETWORK EXPRESS PTE. LTD.',
      portalName: 'ONE eCommerce Portal',
      headquarters: '7 Straits View, Marina One East Tower, Singapore 018936',
      accentColor: '#c8105d',
      standardClause: 'RECEIVED by the Carrier from the Shipper in apparent good order and condition unless otherwise indicated herein, the Goods or Container(s) stated herein to be carried subject to the terms and conditions on the Carrier Bill of Lading.'
    },
    MAERSK: {
      code: 'MAERSK',
      scac: 'MAEU',
      name: 'MAERSK A/S',
      portalName: 'Maersk Shipment Hub',
      headquarters: 'Esplanaden 50, 1263 Copenhagen K, Denmark',
      accentColor: '#00689d',
      standardClause: 'RECEIVED for carriage as above in apparent good order and condition unless otherwise stated hereon. Shipper declares that all particulars including SOLAS Verified Gross Mass are true and accurate.'
    },
    CMA_CGM: {
      code: 'CMA_CGM',
      scac: 'CMDU',
      name: 'CMA CGM S.A.',
      portalName: 'My CMA CGM eBusiness',
      headquarters: 'Boulevard Jacques Saade, 4 Quai d\'Arenc, 13235 Marseille, France',
      accentColor: '#0b2d6d',
      standardClause: 'SHIPPED ON BOARD in apparent good order and condition (unless otherwise stated herein) the Goods or packages specified herein for carriage from Port of Loading to Port of Discharge.'
    },
    HAPAG_LLOYD: {
      code: 'HAPAG_LLOYD',
      scac: 'HLCU',
      name: 'HAPAG-LLOYD AG',
      portalName: 'Hapag-Lloyd Online Business',
      headquarters: 'Ballindamm 25, 20095 Hamburg, Germany',
      accentColor: '#d9531e',
      standardClause: 'RECEIVED by the Carrier in external apparent good order and condition for transportation under the terms of the Hapag-Lloyd Bill of Lading / Sea Waybill.'
    }
  };

  const BL_TYPES = ['ORIGINAL', 'SEAWAYBILL', 'SURRENDERED'];
  const FREIGHT_TERMS = ['PREPAID', 'COLLECT'];
  const PACKAGE_TYPES = [
    'CARTONS', 'PALLETS', 'PACKAGES', 'BAGS', 'CASES', 'CRATES',
    'DRUMS', 'ROLLS', 'BUNDLES', 'PIECES', 'BOXES', 'UNITS'
  ];

  const ISO6346_LETTER_MAP = {
    A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20, K: 21,
    L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31, U: 32,
    V: 34, W: 35, X: 36, Y: 37, Z: 38
  };

  const FORBIDDEN_SEAL_VALUES = new Set(['TBA', 'TBD', 'N/A', 'NA', 'NONE', 'NIL', '0000', '00000', 'PENDING']);

  const VAGUE_GOODS_DESCRIPTIONS = new Set([
    'GENERAL CARGO',
    'SAID TO CONTAIN',
    'STC',
    'FREIGHT ALL KINDS',
    'FAK',
    'VARIOUS',
    'MERCHANDISE',
    'GOODS',
    'CARGO',
    'CONSOLIDATED CARGO',
    'AS PER INVOICE',
    'AS PER PACKING LIST'
  ]);

  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function normalizeText(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeUpper(value) {
    return normalizeText(value).toUpperCase();
  }

  function normalizeBookingNo(value) {
    return normalizeUpper(value).replace(/\s+/g, '');
  }

  function createError(code, field, message, remediation) {
    return { code, field, message, remediation };
  }

  function calculateIso6346CheckDigit(prefix10) {
    const clean = normalizeUpper(prefix10).replace(/[\s-]/g, '');
    if (!/^[A-Z]{4}[0-9]{6}$/.test(clean)) {
      return {
        valid: false,
        error: 'ISO 6346 calculation requires exactly 4 uppercase letters followed by 6 digits (10 characters).'
      };
    }

    const steps = [];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const ch = clean[i];
      const numericValue = i < 4 ? ISO6346_LETTER_MAP[ch] : Number(ch);
      const weight = Math.pow(2, i);
      const product = numericValue * weight;
      sum += product;
      steps.push({
        position: i + 1,
        char: ch,
        numericValue,
        weight,
        product
      });
    }

    const remainder = sum % 11;
    const checkDigit = remainder === 10 ? 0 : remainder;

    return {
      valid: true,
      prefix10: clean,
      fullContainerNo: clean + String(checkDigit),
      sum,
      remainder,
      checkDigit,
      steps
    };
  }

  function validateContainerNumber(containerNo) {
    const clean = normalizeUpper(containerNo).replace(/[\s-]/g, '');
    if (!clean) {
      return {
        valid: false,
        normalized: '',
        error: 'Container number is mandatory.',
        remediation: 'Enter an 11-character ISO 6346 container number (e.g., MSCU1234565).'
      };
    }

    if (clean.length !== 11) {
      return {
        valid: false,
        normalized: clean,
        error: `Container "${clean}" has ${clean.length} characters; ISO 6346 requires exactly 11 characters.`,
        remediation: 'Provide 4 owner/category letters + 6 serial digits + 1 check digit (total 11 characters).'
      };
    }

    if (!/^[A-Z]{3}/.test(clean)) {
      return {
        valid: false,
        normalized: clean,
        error: `Container "${clean}" has invalid owner prefix. Characters 1–3 must be uppercase letters (A–Z).`,
        remediation: 'Verify the 3-letter BIC owner code on the container door.'
      };
    }

    const categoryChar = clean[3];
    if (!['U', 'J', 'Z'].includes(categoryChar)) {
      return {
        valid: false,
        normalized: clean,
        error: `Container "${clean}" has invalid 4th character "${categoryChar}". ISO 6346 category identifier must be U, J, or Z.`,
        remediation: 'Check the 4th character on the container door (U = Freight Container, J = Detachable Equipment, Z = Trailer/Chassis).'
      };
    }

    if (!/^[A-Z]{4}[0-9]{6}[0-9]$/.test(clean)) {
      return {
        valid: false,
        normalized: clean,
        error: `Container "${clean}" must end with 7 numeric digits after the 4-letter prefix.`,
        remediation: 'Ensure positions 5–11 contain digits only (6 serial digits + 1 check digit).'
      };
    }

    const calc = calculateIso6346CheckDigit(clean.slice(0, 10));
    const actualDigit = Number(clean[10]);
    if (actualDigit !== calc.checkDigit) {
      return {
        valid: false,
        normalized: clean,
        expectedCheckDigit: calc.checkDigit,
        actualCheckDigit: actualDigit,
        steps: calc.steps,
        sum: calc.sum,
        remainder: calc.remainder,
        error: `Invalid ISO 6346 Check Digit for "${clean}": expected "${calc.checkDigit}" (Sum=${calc.sum}, Mod 11=${calc.remainder}) but received "${actualDigit}".`,
        remediation: `Correct the container number typo or verify the 11th check digit (valid check digit for ${clean.slice(0, 10)} is ${calc.checkDigit}).`
      };
    }

    return {
      valid: true,
      normalized: clean,
      expectedCheckDigit: calc.checkDigit,
      actualCheckDigit: actualDigit,
      steps: calc.steps,
      sum: calc.sum,
      remainder: calc.remainder,
      error: null
    };
  }

  function validatePartyBlock(text, fieldKey, label) {
    const errors = [];
    const raw = normalizeText(text);
    if (!raw) {
      errors.push(createError(
        'EDI_PARTY_EMPTY',
        fieldKey,
        `${label} is mandatory.`,
        `Enter full legal name, street address, and city/country for ${label} (max 5 lines × 35 characters).`
      ));
      return errors;
    }

    const lines = raw.split(/\r?\n/);
    if (lines.length > 5) {
      errors.push(createError(
        'EDI_PARTY_MAX_LINES',
        fieldKey,
        `${label} has ${lines.length} lines; UN/EDIFACT B/L party box permits at most 5 lines.`,
        `Condense ${label} into 5 lines or fewer so text does not overflow the Bill of Lading box.`
      ));
    }

    lines.forEach((line, idx) => {
      if (line.length > 35) {
        errors.push(createError(
          'EDI_PARTY_LINE_LENGTH',
          fieldKey,
          `${label} line ${idx + 1} is ${line.length} characters (maximum 35 characters per line).`,
          `Wrap or abbreviate line ${idx + 1} of ${label} to <= 35 characters.`
        ));
      }
    });

    return errors;
  }

  function validateTextBlockBounds(text, fieldKey, label, maxLines, maxLineLen, minLength) {
    const errors = [];
    const raw = normalizeText(text);
    if (!raw) {
      errors.push(createError(
        'FIELD_REQUIRED',
        fieldKey,
        `${label} is mandatory.`,
        `Provide ${label}.`
      ));
      return errors;
    }

    if (minLength && raw.length < minLength) {
      errors.push(createError(
        'FIELD_TOO_SHORT',
        fieldKey,
        `${label} must be at least ${minLength} characters (received ${raw.length}).`,
        `Enter a detailed commercial ${label.toLowerCase()} acceptable for customs manifest filing.`
      ));
    }

    const lines = raw.split(/\r?\n/);
    if (lines.length > maxLines) {
      errors.push(createError(
        'EDI_TEXT_MAX_LINES',
        fieldKey,
        `${label} has ${lines.length} lines (maximum ${maxLines} lines).`,
        `Shorten ${label} to at most ${maxLines} lines.`
      ));
    }

    lines.forEach((line, idx) => {
      if (line.length > maxLineLen) {
        errors.push(createError(
          'EDI_TEXT_LINE_LENGTH',
          fieldKey,
          `${label} line ${idx + 1} has ${line.length} characters (maximum ${maxLineLen} characters per line).`,
          `Wrap line ${idx + 1} of ${label} to <= ${maxLineLen} characters.`
        ));
      }
    });

    return errors;
  }

  function validateCommonHeader(payload, errors) {
    const bookingNo = normalizeBookingNo(payload.bookingNo);
    if (!/^[A-Z0-9-]{5,20}$/.test(bookingNo)) {
      errors.push(createError(
        'INVALID_BOOKING_NO',
        'bookingNo',
        `Booking No. "${bookingNo || '(empty)'}" is invalid. Expected 5–20 uppercase alphanumeric/hyphen characters.`,
        'Enter the exact carrier Booking Confirmation Number (e.g., BKG20260001 or ONEYSIN260123).'
      ));
    }

    const carrierLine = normalizeUpper(payload.carrierLine);
    if (!CARRIER_PROFILES[carrierLine]) {
      errors.push(createError(
        'INVALID_CARRIER',
        'carrierLine',
        `Carrier "${carrierLine || '(empty)'}" is not a supported carrier profile.`,
        `Select one of: ${Object.keys(CARRIER_PROFILES).join(', ')}.`
      ));
    }

    if (!normalizeText(payload.vesselName)) {
      errors.push(createError(
        'VESSEL_REQUIRED',
        'vesselName',
        'Vessel Name is mandatory.',
        'Enter the ocean vessel name shown on your Booking Confirmation.'
      ));
    }

    if (!normalizeText(payload.voyageNo)) {
      errors.push(createError(
        'VOYAGE_REQUIRED',
        'voyageNo',
        'Voyage No. is mandatory.',
        'Enter the voyage number (e.g., 042E).'
      ));
    }

    return { bookingNo, carrierLine };
  }

  function validateVgmSubmission(payload, existingSi) {
    const errors = [];
    const data = payload || {};
    const { bookingNo, carrierLine } = validateCommonHeader(data, errors);

    const authorizedPersonRaw = normalizeText(data.authorizedPerson);
    if (!authorizedPersonRaw) {
      errors.push(createError(
        'VGM_SIGNATORY_REQUIRED',
        'authorizedPerson',
        'SOLAS Authorized Person / Signatory Name is mandatory.',
        'Enter the full name of the authorized person in ALL CAPS (e.g., NGUYEN VAN A).'
      ));
    } else if (authorizedPersonRaw !== authorizedPersonRaw.toUpperCase() || !/^[A-Z .'-]{3,80}$/.test(authorizedPersonRaw)) {
      errors.push(createError(
        'VGM_SIGNATORY_FORMAT',
        'authorizedPerson',
        `Authorized Person "${authorizedPersonRaw}" must be entered in ALL CAPS letters (3–80 chars, no digits/symbols).`,
        'Convert the signatory name to uppercase English/ASCII characters (e.g., TRAN MINH TUAN).'
      ));
    }

    if (!normalizeText(data.declarantCompany)) {
      errors.push(createError(
        'VGM_COMPANY_REQUIRED',
        'declarantCompany',
        'Shipper / Declarant Company Name is mandatory under SOLAS Chapter VI Reg 2.',
        'Enter the legally responsible shipper or forwarder company name.'
      ));
    }

    const weighingDateTime = normalizeText(data.weighingDateTime);
    if (!weighingDateTime || Number.isNaN(Date.parse(weighingDateTime))) {
      errors.push(createError(
        'VGM_TIMESTAMP_INVALID',
        'weighingDateTime',
        'Valid Weighing / Verification Date & Time is mandatory.',
        'Provide a valid ISO date/time for when the container was weighed or calculated.'
      ));
    }

    if (data.solasDeclarationAccepted !== true) {
      errors.push(createError(
        'SOLAS_DECLARATION_UNCHECKED',
        'solasDeclarationAccepted',
        'Mandatory SOLAS Chapter VI Regulation 2 legal declaration must be accepted.',
        'Tick the legal verification checkbox certifying the VGM accuracy prior to submission.'
      ));
    }

    const containers = Array.isArray(data.containers) ? data.containers : [];
    if (containers.length === 0) {
      errors.push(createError(
        'VGM_CONTAINERS_EMPTY',
        'containers',
        'At least one container is required for SOLAS VGM submission.',
        'Add one or more containers with valid ISO 6346 numbers and verified gross mass.'
      ));
    }

    const siContainerMap = new Map();
    if (existingSi && Array.isArray(existingSi.containers)) {
      for (const sc of existingSi.containers) {
        if (sc && sc.containerNo) {
          siContainerMap.set(normalizeUpper(sc.containerNo), sc);
        }
      }
    }

    const seenContainers = new Set();
    const normalizedContainers = [];

    containers.forEach((rawCont, idx) => {
      const rowNum = idx + 1;
      const prefix = `containers[${idx}]`;
      const isoCheck = validateContainerNumber(rawCont.containerNo);

      if (!isoCheck.valid) {
        errors.push(createError(
          'ISO6346_INVALID',
          `${prefix}.containerNo`,
          `Row ${rowNum}: ${isoCheck.error}`,
          isoCheck.remediation
        ));
      } else if (seenContainers.has(isoCheck.normalized)) {
        errors.push(createError(
          'DUPLICATE_CONTAINER',
          `${prefix}.containerNo`,
          `Row ${rowNum}: Duplicate container number "${isoCheck.normalized}" in VGM submission.`,
          'Remove or correct the duplicate container entry.'
        ));
      } else {
        seenContainers.add(isoCheck.normalized);
      }

      const sizeType = normalizeUpper(rawCont.sizeType);
      const spec = EQUIPMENT_SPECS[sizeType];
      if (!spec) {
        errors.push(createError(
          'INVALID_SIZE_TYPE',
          `${prefix}.sizeType`,
          `Row ${rowNum}: Invalid container Size/Type "${sizeType || '(empty)'}".`,
          `Select a valid equipment type: ${Object.keys(EQUIPMENT_SPECS).join(', ')}.`
        ));
      }

      const method = normalizeUpper(rawCont.method);
      if (method !== 'METHOD_1' && method !== 'METHOD_2') {
        errors.push(createError(
          'INVALID_VGM_METHOD',
          `${prefix}.method`,
          `Row ${rowNum}: VGM Weighing Method must be METHOD_1 or METHOD_2.`,
          'Select SOLAS Method 1 (Weighed Packed Container) or Method 2 (Calculated Cargo + Dunnage + Tare).'
        ));
      }

      const tareWeightKgm = Number(rawCont.tareWeightKgm);
      const maxGrossWeightKgm = rawCont.maxGrossWeightKgm !== undefined && rawCont.maxGrossWeightKgm !== ''
        ? Number(rawCont.maxGrossWeightKgm)
        : (spec ? spec.maxGrossWeightKgm : 30480);
      const cargoWeightKgm = rawCont.cargoWeightKgm !== undefined && rawCont.cargoWeightKgm !== ''
        ? Number(rawCont.cargoWeightKgm)
        : 0;
      const dunnageWeightKgm = rawCont.dunnageWeightKgm !== undefined && rawCont.dunnageWeightKgm !== ''
        ? Number(rawCont.dunnageWeightKgm)
        : 0;
      const vgmWeightKgm = Number(rawCont.vgmWeightKgm);

      if (spec) {
        if (!Number.isFinite(tareWeightKgm) || tareWeightKgm < spec.minTareKgm || tareWeightKgm > spec.maxTareKgm) {
          errors.push(createError(
            'INVALID_TARE_WEIGHT',
            `${prefix}.tareWeightKgm`,
            `Row ${rowNum} (${isoCheck.normalized || 'Container'}): Tare weight ${tareWeightKgm} KGS is outside standard CSC range for ${sizeType} (${spec.minTareKgm}–${spec.maxTareKgm} KGS).`,
            `Check the container door CSC plate Tare Weight (typical ${sizeType} tare is ${spec.defaultTareKgm} KGS).`
          ));
        }

        if (!Number.isFinite(maxGrossWeightKgm) || maxGrossWeightKgm < 24000 || maxGrossWeightKgm > spec.maxStructuralMgwKgm) {
          errors.push(createError(
            'INVALID_MGW_BOUND',
            `${prefix}.maxGrossWeightKgm`,
            `Row ${rowNum}: Max Gross Weight ${maxGrossWeightKgm} KGS is outside CSC structural limits for ${sizeType} (24,000–${spec.maxStructuralMgwKgm} KGS).`,
            `Enter the exact Max Gross Weight stamped on the container CSC safety plate (standard: ${spec.maxGrossWeightKgm} KGS).`
          ));
        }
      }

      if (!Number.isFinite(vgmWeightKgm) || vgmWeightKgm <= 0) {
        errors.push(createError(
          'VGM_WEIGHT_REQUIRED',
          `${prefix}.vgmWeightKgm`,
          `Row ${rowNum}: VGM Weight must be a positive number in KGS.`,
          'Enter the verified gross mass in kilograms.'
        ));
      } else {
        if (Number.isFinite(tareWeightKgm) && vgmWeightKgm <= tareWeightKgm) {
          errors.push(createError(
            'VGM_NOT_ABOVE_TARE',
            `${prefix}.vgmWeightKgm`,
            `Row ${rowNum}: VGM Weight (${vgmWeightKgm} KGS) must exceed Container Tare Weight (${tareWeightKgm} KGS).`,
            'Ensure VGM includes both the cargo/packaging mass and the empty container Tare Weight.'
          ));
        }

        if (Number.isFinite(maxGrossWeightKgm) && vgmWeightKgm > maxGrossWeightKgm) {
          errors.push(createError(
            'SOLAS_OVERWEIGHT_CSC',
            `${prefix}.vgmWeightKgm`,
            `Row ${rowNum} (${isoCheck.normalized || 'Container'}): HARD STOP — VGM (${vgmWeightKgm} KGS) exceeds Container CSC Max Gross Weight (${maxGrossWeightKgm} KGS) by ${round2(vgmWeightKgm - maxGrossWeightKgm)} KGS.`,
            'Terminal gate-in and vessel loading are prohibited for overweight containers. Re-stuff cargo or split across another container.'
          ));
        }
      }

      if (method === 'METHOD_2') {
        if (!Number.isFinite(cargoWeightKgm) || cargoWeightKgm <= 0) {
          errors.push(createError(
            'METHOD2_CARGO_REQUIRED',
            `${prefix}.cargoWeightKgm`,
            `Row ${rowNum}: SOLAS Method 2 requires positive Net/Gross Cargo Weight (> 0 KGS).`,
            'Enter the weighed cargo weight from the Packing List / certified scales.'
          ));
        }
        if (!Number.isFinite(dunnageWeightKgm) || dunnageWeightKgm < 0) {
          errors.push(createError(
            'METHOD2_DUNNAGE_INVALID',
            `${prefix}.dunnageWeightKgm`,
            `Row ${rowNum}: Dunnage / Lashing / Pallet weight cannot be negative.`,
            'Enter 0 or the exact weight of pallets, dunnage, and bracing materials in KGS.'
          ));
        }
        if (Number.isFinite(cargoWeightKgm) && Number.isFinite(dunnageWeightKgm) && Number.isFinite(tareWeightKgm) && Number.isFinite(vgmWeightKgm)) {
          const expectedMethod2 = round2(cargoWeightKgm + dunnageWeightKgm + tareWeightKgm);
          if (Math.abs(round2(vgmWeightKgm) - expectedMethod2) > 0.01) {
            errors.push(createError(
              'METHOD2_SUM_MISMATCH',
              `${prefix}.vgmWeightKgm`,
              `Row ${rowNum}: SOLAS Method 2 equation failed: Cargo (${cargoWeightKgm}) + Dunnage (${dunnageWeightKgm}) + Tare (${tareWeightKgm}) = ${expectedMethod2} KGS, but VGM was entered as ${round2(vgmWeightKgm)} KGS.`,
              `Set VGM Weight to exactly ${expectedMethod2} KGS or correct the component weights.`
            ));
          }
        }
      }

      // Cross-check against existing SI container if present
      if (isoCheck.valid && siContainerMap.has(isoCheck.normalized)) {
        const siCont = siContainerMap.get(isoCheck.normalized);
        if (sizeType && siCont.sizeType && sizeType !== siCont.sizeType) {
          errors.push(createError(
            'SI_VGM_SIZETYPE_MISMATCH',
            `${prefix}.sizeType`,
            `Row ${rowNum} (${isoCheck.normalized}): Equipment Size/Type "${sizeType}" conflicts with SI Size/Type "${siCont.sizeType}".`,
            `Match the Size/Type on both e-SI and SOLAS VGM (${siCont.sizeType}).`
          ));
        }

        if (Number.isFinite(tareWeightKgm) && Number.isFinite(vgmWeightKgm)) {
          const expectedVgmFromSi = round2(Number(siCont.cargoGrossWeightKgm) + tareWeightKgm);
          if (Math.abs(round2(vgmWeightKgm) - expectedVgmFromSi) > 0.01) {
            errors.push(createError(
              'SI_VGM_WEIGHT_MISMATCH',
              `${prefix}.vgmWeightKgm`,
              `Row ${rowNum} (${isoCheck.normalized}): Cross-document weight mismatch! SI Cargo Gross Weight (${siCont.cargoGrossWeightKgm} KGS) + Container Tare (${tareWeightKgm} KGS) = ${expectedVgmFromSi} KGS, which conflicts with VGM (${round2(vgmWeightKgm)} KGS).`,
              `Update VGM to ${expectedVgmFromSi} KGS (or amend SI Cargo Gross Weight to ${round2(vgmWeightKgm - tareWeightKgm)} KGS).`
            ));
          }

          if (method === 'METHOD_2' && Number.isFinite(cargoWeightKgm) && Number.isFinite(dunnageWeightKgm)) {
            const cargoPlusDunnage = round2(cargoWeightKgm + dunnageWeightKgm);
            if (Math.abs(cargoPlusDunnage - round2(siCont.cargoGrossWeightKgm)) > 0.01) {
              errors.push(createError(
                'SI_VGM_METHOD2_CARGO_MISMATCH',
                `${prefix}.cargoWeightKgm`,
                `Row ${rowNum} (${isoCheck.normalized}): Method 2 Cargo + Dunnage (${cargoPlusDunnage} KGS) must equal SI Cargo Gross Weight (${siCont.cargoGrossWeightKgm} KGS).`,
                `Align Method 2 cargo + dunnage total with SI Cargo Gross Weight (${siCont.cargoGrossWeightKgm} KGS).`
              ));
            }
          }
        }
      }

      normalizedContainers.push({
        containerNo: isoCheck.normalized || normalizeUpper(rawCont.containerNo),
        sizeType,
        method,
        cargoWeightKgm: round2(cargoWeightKgm),
        dunnageWeightKgm: round2(dunnageWeightKgm),
        tareWeightKgm: round2(tareWeightKgm),
        maxGrossWeightKgm: round2(maxGrossWeightKgm),
        vgmWeightKgm: round2(vgmWeightKgm)
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      normalized: {
        bookingNo,
        carrierLine,
        vesselName: normalizeUpper(data.vesselName),
        voyageNo: normalizeUpper(data.voyageNo),
        authorizedPerson: authorizedPersonRaw,
        declarantCompany: normalizeUpper(data.declarantCompany),
        weighbridgeRef: normalizeUpper(data.weighbridgeRef),
        weighingDateTime,
        solasDeclarationAccepted: Boolean(data.solasDeclarationAccepted),
        amendmentReason: normalizeText(data.amendmentReason),
        containers: normalizedContainers
      }
    };
  }

  function validateSiSubmission(payload, existingVgm) {
    const errors = [];
    const data = payload || {};
    const { bookingNo, carrierLine } = validateCommonHeader(data, errors);

    const blType = normalizeUpper(data.blType);
    if (!BL_TYPES.includes(blType)) {
      errors.push(createError(
        'INVALID_BL_TYPE',
        'blType',
        `B/L Type "${blType || '(empty)'}" is invalid.`,
        `Select one of: ${BL_TYPES.join(', ')}.`
      ));
    }

    const freightTerms = normalizeUpper(data.freightTerms);
    if (!FREIGHT_TERMS.includes(freightTerms)) {
      errors.push(createError(
        'INVALID_FREIGHT_TERMS',
        'freightTerms',
        `Freight Terms "${freightTerms || '(empty)'}" must be PREPAID or COLLECT.`,
        'Select PREPAID or COLLECT matching the Booking Confirmation.'
      ));
    }

    const placeOfIssue = normalizeUpper(data.placeOfIssue);
    if (!placeOfIssue) {
      errors.push(createError(
        'PLACE_OF_ISSUE_REQUIRED',
        'placeOfIssue',
        'Place of B/L Issue is mandatory.',
        'Specify the port/city where the Bill of Lading is issued (e.g., HO CHI MINH CITY, VIETNAM).'
      ));
    }

    const noOfOriginals = Number(data.noOfOriginals);
    if (blType === 'SEAWAYBILL') {
      if (!Number.isInteger(noOfOriginals) || noOfOriginals !== 0) {
        errors.push(createError(
          'SEAWAYBILL_ORIGINALS_MUST_BE_ZERO',
          'noOfOriginals',
          'Sea Waybill (Non-Negotiable) must specify 0 Original B/Ls.',
          'Set Number of Originals to 0 for SEAWAYBILL.'
        ));
      }
    } else if (blType === 'ORIGINAL' || blType === 'SURRENDERED') {
      if (!Number.isInteger(noOfOriginals) || noOfOriginals < 1 || noOfOriginals > 3) {
        errors.push(createError(
          'ORIGINALS_COUNT_INVALID',
          'noOfOriginals',
          `Number of Original B/Ls must be 1, 2, or 3 for ${blType}.`,
          'Standard maritime practice issues 3/3 Original B/Ls.'
        ));
      }
    }

    const placeOfReceipt = normalizeUpper(data.placeOfReceipt);
    const portOfLoading = normalizeUpper(data.portOfLoading);
    const portOfDischarge = normalizeUpper(data.portOfDischarge);
    const placeOfDelivery = normalizeUpper(data.placeOfDelivery);

    if (!placeOfReceipt) {
      errors.push(createError('RECEIPT_REQUIRED', 'placeOfReceipt', 'Place of Receipt is mandatory.', 'Enter Place of Receipt (usually same as Port of Loading for CY-CY).'));
    }
    if (!portOfLoading) {
      errors.push(createError('POL_REQUIRED', 'portOfLoading', 'Port of Loading (POL) is mandatory.', 'Enter Port of Loading (e.g., VNSGN / CAT LAI, HO CHI MINH).'));
    }
    if (!portOfDischarge) {
      errors.push(createError('POD_REQUIRED', 'portOfDischarge', 'Port of Discharge (POD) is mandatory.', 'Enter Port of Discharge (e.g., USLAX / LOS ANGELES, CA).'));
    }
    if (portOfLoading && portOfDischarge && portOfLoading === portOfDischarge) {
      errors.push(createError(
        'POL_EQUALS_POD',
        'portOfDischarge',
        `Port of Discharge "${portOfDischarge}" cannot be identical to Port of Loading "${portOfLoading}".`,
        'Enter a valid destination Port of Discharge distinct from the Port of Loading.'
      ));
    }
    if (!placeOfDelivery) {
      errors.push(createError('DELIVERY_REQUIRED', 'placeOfDelivery', 'Place of Delivery is mandatory.', 'Enter Place of Delivery.'));
    }

    errors.push(...validatePartyBlock(data.shipper, 'shipper', 'Shipper'));
    errors.push(...validatePartyBlock(data.consignee, 'consignee', 'Consignee'));
    errors.push(...validatePartyBlock(data.notifyParty, 'notifyParty', 'Notify Party'));

    const consigneeUpper = normalizeUpper(data.consignee);
    const notifyUpper = normalizeUpper(data.notifyParty);
    const isToOrder = /\bTO\s+ORDER\b/.test(consigneeUpper);
    if (isToOrder) {
      if (blType === 'SEAWAYBILL') {
        errors.push(createError(
          'NEGOTIABLE_SEAWAYBILL_CONFLICT',
          'blType',
          'Negotiable Consignee ("TO ORDER...") cannot be issued under a non-negotiable Sea Waybill.',
          'Change B/L Type to ORIGINAL or SURRENDERED, or name a specific Consignee for Sea Waybill.'
        ));
      }
      if (/SAME\s+AS\s+CONSIGNEE|SAME\s+AS\s+ABOVE/.test(notifyUpper)) {
        errors.push(createError(
          'TO_ORDER_NOTIFY_INVALID',
          'notifyParty',
          'When Consignee is "TO ORDER...", Notify Party cannot be "SAME AS CONSIGNEE".',
          'Provide the actual Notify Party company name, address, and contact details.'
        ));
      }
    }

    const hsCodeRaw = normalizeText(data.hsCode);
    if (!/^[0-9]{6,10}$/.test(hsCodeRaw)) {
      errors.push(createError(
        'INVALID_HS_CODE',
        'hsCode',
        `HS Code "${hsCodeRaw || '(empty)'}" must be 6 to 10 numeric digits without dots or spaces.`,
        'Enter at least the 6-digit Harmonized System commodity code (e.g., 940360).'
      ));
    }

    errors.push(...validateTextBlockBounds(data.marksAndNumbers, 'marksAndNumbers', 'Marks & Numbers', 15, 25, 1));
    errors.push(...validateTextBlockBounds(data.goodsDescription, 'goodsDescription', 'Description of Goods', 30, 48, 10));

    const goodsCleanUpper = normalizeUpper(data.goodsDescription).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (VAGUE_GOODS_DESCRIPTIONS.has(goodsCleanUpper)) {
      errors.push(createError(
        'VAGUE_GOODS_DESCRIPTION',
        'goodsDescription',
        `Cargo description "${normalizeText(data.goodsDescription)}" is rejected by Customs/Carriers as overly vague.`,
        'Provide a specific commercial description (commodity, material, model/usage) compliant with US CBP 24-Hour / EU ICS2 rules.'
      ));
    }

    const containers = Array.isArray(data.containers) ? data.containers : [];
    if (containers.length === 0) {
      errors.push(createError(
        'SI_CONTAINERS_EMPTY',
        'containers',
        'At least one container with seal, package count, weight, and CBM is required.',
        'Add container & cargo rows matching your Booking and Packing List.'
      ));
    }

    const vgmContainerMap = new Map();
    if (existingVgm && Array.isArray(existingVgm.containers)) {
      for (const vc of existingVgm.containers) {
        if (vc && vc.containerNo) {
          vgmContainerMap.set(normalizeUpper(vc.containerNo), vc);
        }
      }
    }

    const seenContainers = new Set();
    const normalizedContainers = [];

    containers.forEach((rawCont, idx) => {
      const rowNum = idx + 1;
      const prefix = `containers[${idx}]`;
      const isoCheck = validateContainerNumber(rawCont.containerNo);

      if (!isoCheck.valid) {
        errors.push(createError(
          'ISO6346_INVALID',
          `${prefix}.containerNo`,
          `Row ${rowNum}: ${isoCheck.error}`,
          isoCheck.remediation
        ));
      } else if (seenContainers.has(isoCheck.normalized)) {
        errors.push(createError(
          'DUPLICATE_CONTAINER',
          `${prefix}.containerNo`,
          `Row ${rowNum}: Duplicate container number "${isoCheck.normalized}" in SI.`,
          'Each container number may appear only once in the Equipment & Cargo table.'
        ));
      } else {
        seenContainers.add(isoCheck.normalized);
      }

      const sealNo = normalizeUpper(rawCont.sealNo);
      if (!/^[A-Z0-9-]{4,15}$/.test(sealNo) || FORBIDDEN_SEAL_VALUES.has(sealNo)) {
        errors.push(createError(
          'INVALID_SEAL_NO',
          `${prefix}.sealNo`,
          `Row ${rowNum}: Carrier/High-Security Seal No. "${sealNo || '(empty)'}" is invalid or placeholder.`,
          'Enter the physical bolt seal number (4–15 alphanumeric characters; TBA/N/A are prohibited).'
        ));
      }

      const sizeType = normalizeUpper(rawCont.sizeType);
      const spec = EQUIPMENT_SPECS[sizeType];
      if (!spec) {
        errors.push(createError(
          'INVALID_SIZE_TYPE',
          `${prefix}.sizeType`,
          `Row ${rowNum}: Invalid container Size/Type "${sizeType || '(empty)'}".`,
          `Select a valid equipment type: ${Object.keys(EQUIPMENT_SPECS).join(', ')}.`
        ));
      }

      const packageCount = Number(rawCont.packageCount);
      if (!Number.isInteger(packageCount) || packageCount < 1) {
        errors.push(createError(
          'INVALID_PACKAGE_COUNT',
          `${prefix}.packageCount`,
          `Row ${rowNum}: Package Count must be an integer >= 1.`,
          'Enter the exact number of outer packages/cartons/pallets from the Packing List.'
        ));
      }

      const packageType = normalizeUpper(rawCont.packageType);
      if (!packageType) {
        errors.push(createError(
          'PACKAGE_TYPE_REQUIRED',
          `${prefix}.packageType`,
          `Row ${rowNum}: Package Type is mandatory (e.g., CARTONS, PALLETS).`,
          'Specify a standard UN/EDIFACT outer package type.'
        ));
      }

      const cargoGrossWeightKgm = Number(rawCont.cargoGrossWeightKgm);
      if (!Number.isFinite(cargoGrossWeightKgm) || cargoGrossWeightKgm <= 0) {
        errors.push(createError(
          'INVALID_CARGO_WEIGHT',
          `${prefix}.cargoGrossWeightKgm`,
          `Row ${rowNum}: Cargo Gross Weight must be > 0 KGS (goods + packaging, excluding container tare).`,
          'Enter Cargo Gross Weight in KGS from the Packing List.'
        ));
      } else if (spec) {
        const vgmCont = isoCheck.valid ? vgmContainerMap.get(isoCheck.normalized) : null;
        const effectiveMgw = vgmCont ? Number(vgmCont.maxGrossWeightKgm) : spec.maxGrossWeightKgm;
        const effectiveTare = vgmCont ? Number(vgmCont.tareWeightKgm) : spec.defaultTareKgm;
        const maxPayload = round2(effectiveMgw - effectiveTare);
        if (cargoGrossWeightKgm > maxPayload) {
          errors.push(createError(
            'CARGO_EXCEEDS_PAYLOAD',
            `${prefix}.cargoGrossWeightKgm`,
            `Row ${rowNum} (${isoCheck.normalized || 'Container'}): Cargo Gross Weight (${cargoGrossWeightKgm} KGS) exceeds max safe payload (${maxPayload} KGS = MGW ${effectiveMgw} - Tare ${effectiveTare}).`,
            'Reduce cargo weight or verify container CSC Max Gross Weight.'
          ));
        }
      }

      const measurementCbm = Number(rawCont.measurementCbm);
      if (!Number.isFinite(measurementCbm) || measurementCbm <= 0) {
        errors.push(createError(
          'INVALID_MEASUREMENT',
          `${prefix}.measurementCbm`,
          `Row ${rowNum}: Measurement (CBM) must be > 0.`,
          'Enter total cargo volume in cubic meters (m3).'
        ));
      } else if (spec && measurementCbm > spec.maxVolumeCbm) {
        errors.push(createError(
          'CBM_EXCEEDS_CAPACITY',
          `${prefix}.measurementCbm`,
          `Row ${rowNum} (${sizeType}): Measurement (${measurementCbm} CBM) exceeds internal cubic capacity of ${sizeType} (${spec.maxVolumeCbm} CBM).`,
          `Verify total CBM calculation; a ${sizeType} cannot physically hold more than ${spec.maxVolumeCbm} CBM.`
        ));
      }

      // Cross-check against already submitted VGM if present
      if (isoCheck.valid && vgmContainerMap.has(isoCheck.normalized)) {
        const vgmCont = vgmContainerMap.get(isoCheck.normalized);
        if (sizeType && vgmCont.sizeType && sizeType !== vgmCont.sizeType) {
          errors.push(createError(
            'SI_VGM_SIZETYPE_MISMATCH',
            `${prefix}.sizeType`,
            `Row ${rowNum} (${isoCheck.normalized}): SI Size/Type "${sizeType}" conflicts with submitted VGM Size/Type "${vgmCont.sizeType}".`,
            `Change Size/Type to "${vgmCont.sizeType}" or amend the VGM declaration.`
          ));
        }
        if (Number.isFinite(cargoGrossWeightKgm)) {
          const impliedVgm = round2(cargoGrossWeightKgm + Number(vgmCont.tareWeightKgm));
          if (Math.abs(impliedVgm - round2(vgmCont.vgmWeightKgm)) > 0.01) {
            errors.push(createError(
              'SI_VGM_WEIGHT_MISMATCH',
              `${prefix}.cargoGrossWeightKgm`,
              `Row ${rowNum} (${isoCheck.normalized}): Weight mismatch with submitted VGM! SI Cargo (${cargoGrossWeightKgm} KGS) + VGM Tare (${vgmCont.tareWeightKgm} KGS) = ${impliedVgm} KGS, but VGM was declared as ${vgmCont.vgmWeightKgm} KGS.`,
              `Adjust SI Cargo Gross Weight to ${round2(Number(vgmCont.vgmWeightKgm) - Number(vgmCont.tareWeightKgm))} KGS or submit a VGM Amendment.`
            ));
          }
        }
      }

      normalizedContainers.push({
        containerNo: isoCheck.normalized || normalizeUpper(rawCont.containerNo),
        sealNo,
        sizeType,
        packageCount,
        packageType,
        cargoGrossWeightKgm: round2(cargoGrossWeightKgm),
        measurementCbm: round2(measurementCbm)
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      normalized: {
        bookingNo,
        carrierLine,
        blType,
        freightTerms,
        placeOfIssue,
        noOfOriginals,
        vesselName: normalizeUpper(data.vesselName),
        voyageNo: normalizeUpper(data.voyageNo),
        placeOfReceipt,
        portOfLoading,
        portOfDischarge,
        placeOfDelivery,
        shipper: normalizeText(data.shipper),
        consignee: normalizeText(data.consignee),
        notifyParty: normalizeText(data.notifyParty),
        hsCode: hsCodeRaw,
        marksAndNumbers: normalizeText(data.marksAndNumbers),
        goodsDescription: normalizeText(data.goodsDescription),
        specialClauses: normalizeText(data.specialClauses),
        amendmentReason: normalizeText(data.amendmentReason),
        containers: normalizedContainers
      }
    };
  }

  function validateBlApproval(shipment) {
    const errors = [];
    if (!shipment) {
      errors.push(createError('SHIPMENT_NOT_FOUND', 'bookingNo', 'Shipment not found.', 'Submit SI and VGM first.'));
      return { valid: false, errors };
    }

    if (shipment.siStatus !== 'SUBMITTED' || !shipment.siData) {
      errors.push(createError(
        'SI_NOT_SUBMITTED',
        'siStatus',
        'Cannot approve Final B/L because Shipping Instruction (e-SI) has not been submitted.',
        'Complete and submit e-SI before approving Final B/L.'
      ));
    }

    if (shipment.vgmStatus !== 'SUBMITTED' || !shipment.vgmData) {
      errors.push(createError(
        'NO_VGM_NO_FINAL_BL',
        'vgmStatus',
        'SOLAS HARD STOP ("No VGM, No Load / No Final B/L"): Valid SOLAS VGM has not been submitted for this booking.',
        'Submit SOLAS VGM for all containers in this booking before approving Final B/L.'
      ));
    }

    if (shipment.siData && shipment.vgmData) {
      const siConts = shipment.siData.containers || [];
      const vgmMap = new Map((shipment.vgmData.containers || []).map((c) => [c.containerNo, c]));

      for (const sc of siConts) {
        const vc = vgmMap.get(sc.containerNo);
        if (!vc) {
          errors.push(createError(
            'MISSING_CONTAINER_VGM',
            'containers',
            `SOLAS HARD STOP: Container ${sc.containerNo} on e-SI has no submitted VGM declaration.`,
            `Submit VGM for container ${sc.containerNo}.`
          ));
        } else {
          const expectedVgm = round2(Number(sc.cargoGrossWeightKgm) + Number(vc.tareWeightKgm));
          if (Math.abs(expectedVgm - round2(vc.vgmWeightKgm)) > 0.01) {
            errors.push(createError(
              'BL_APPROVAL_WEIGHT_CONFLICT',
              'containers',
              `Container ${sc.containerNo}: SI Cargo (${sc.cargoGrossWeightKgm}) + Tare (${vc.tareWeightKgm}) = ${expectedVgm} KGS conflicts with VGM (${vc.vgmWeightKgm} KGS).`,
              'Reconcile SI and VGM weights via Amendment before Final B/L approval.'
            ));
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  function formatContainerSummaryWords(containers) {
    const list = Array.isArray(containers) ? containers : [];
    if (list.length === 0) return 'ZERO (0) CONTAINER';
    const ones = [
      'ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
      'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'
    ];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    function toWords(n) {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
      return String(n);
    }
    const counts = new Map();
    for (const c of list) {
      const st = c.sizeType || 'CNTR';
      counts.set(st, (counts.get(st) || 0) + 1);
    }
    const parts = [];
    for (const [st, count] of counts.entries()) {
      const padded = count < 10 ? '0' + count : String(count);
      parts.push(`${toWords(count)} (${padded}) X ${st} CONTAINER${count > 1 ? 'S' : ''}`);
    }
    return `SAY TOTAL: ${parts.join(' AND ')} ONLY`;
  }

  return {
    EQUIPMENT_SPECS,
    CARRIER_PROFILES,
    BL_TYPES,
    FREIGHT_TERMS,
    PACKAGE_TYPES,
    ISO6346_LETTER_MAP,
    round2,
    normalizeText,
    normalizeUpper,
    normalizeBookingNo,
    calculateIso6346CheckDigit,
    validateContainerNumber,
    validatePartyBlock,
    validateVgmSubmission,
    validateSiSubmission,
    validateBlApproval,
    formatContainerSummaryWords
  };
});
