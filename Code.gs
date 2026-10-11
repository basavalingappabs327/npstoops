/**
 * NPS document generator – Google Apps Script back end.
 *
 * Flow:  GitHub Pages form  --POST JSON-->  this web app
 *        -> copy the Google Doc template -> replace {placeholders}
 *        -> export as PDF / DOCX -> return base64 -> browser downloads it
 *
 * SETUP: see the steps in the chat reply / README. Only TEMPLATE_DOC_ID
 * needs to be edited.
 */

// ID of the Google Doc made from NPS_treasury_documents_template.docx
// (the long string in the Doc's URL: docs.google.com/document/d/<THIS_PART>/edit)
const TEMPLATE_DOC_ID = 'PASTE_YOUR_TEMPLATE_GOOGLE_DOC_ID_HERE';

// Placeholders that must be filled (tono is optional)
const REQUIRED = [
  'name', 'pran', 'gpf', 'doj', 'institution', 'institutionplace',
  'taluk', 'district', 'treasuryoffi', 'treasury', 'treasuryloc', 'today'
];
const OPTIONAL = ['tono'];

// Allowed dropdown values – checked again on the server
const TREASURY_OFFICERS = ['ಉಪನಿರ್ದೇಶಕರು', 'ಸಹಾಯಕ ನಿರ್ದೇಶಕರು', 'ಉಪ ಖಜಾನಾಧಿಕಾರಿಗಳು'];
const TREASURY_TYPES = ['ಜಿಲ್ಲಾ ಖಜಾನೆ', 'ತಾಲ್ಲೂಕು ಖಜಾನೆ', 'ತಾಲ್ಲೂಕು ಉಪ ಖಜಾನೆ'];

const FORMATS = {
  pdf:  { mime: 'application/pdf', ext: 'pdf' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' }
};

/** Open the web-app URL in a browser to check it is alive. */
function doGet() {
  return json_({ ok: true, message: 'NPS document service is running' });
}

function doPost(e) {
  let copyId = null;
  try {
    const data = JSON.parse(e.postData.contents);
    const values = clean_(data);
    const fmt = FORMATS[data.format];
    if (!fmt) throw new Error('Invalid format');

    // Every request works on its own temporary copy, so many users can
    // generate documents at the same time without clashing.
    const copy = DriveApp.getFileById(TEMPLATE_DOC_ID)
      .makeCopy('tmp_nps_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    copyId = copy.getId();

    const doc = DocumentApp.openById(copyId);
    fillContainer_(doc.getBody(), values);
    const header = doc.getHeader();
    const footer = doc.getFooter();
    if (header) fillContainer_(header, values);
    if (footer) fillContainer_(footer, values);
    replacePageBreaks_(doc.getBody());
    doc.saveAndClose();

    const url = 'https://docs.google.com/document/d/' + copyId + '/export?format=' + fmt.ext;
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('Export failed (' + res.getResponseCode() + ')');
    }

    return json_({
      ok: true,
      filename: 'NPS_' + values.pran + '.' + fmt.ext,
      mime: fmt.mime,
      base64: Utilities.base64Encode(res.getContent())
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (copyId) {
      try { DriveApp.getFileById(copyId).setTrashed(true); } catch (_) {}
    }
  }
}

/* ---------- helpers ---------- */

function clean_(data) {
  const out = {};
  REQUIRED.concat(OPTIONAL).forEach(function (k) {
    // strip control characters, trim, cap length
    let v = String(data[k] == null ? '' : data[k])
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .trim()
      .slice(0, 200);
    if (REQUIRED.indexOf(k) !== -1 && !v) throw new Error('Missing field: ' + k);
    out[k] = v;
  });
  if (TREASURY_OFFICERS.indexOf(out.treasuryoffi) === -1) throw new Error('Invalid treasury officer');
  if (TREASURY_TYPES.indexOf(out.treasury) === -1) throw new Error('Invalid treasury type');
  if (!/^\d{12}$/.test(out.pran)) throw new Error('PRAN must be 12 digits');
  return out;
}

// replaceText() takes a regex pattern + a replacement where \ and $ are special
function escapeReplacement_(s) {
  return s.replace(/[\\$]/g, function (m) { return '\\' + m; });
}

function fillContainer_(container, values) {
  Object.keys(values).forEach(function (key) {
    container.replaceText('\\{' + key + '\\}', escapeReplacement_(values[key]));
  });
}

// {pagebreak} -> real page break
function replacePageBreaks_(body) {
  for (let i = 0; i < 100; i++) {
    const found = body.findText('\\{pagebreak\\}');
    if (!found) break;
    const textEl = found.getElement().asText();
    textEl.deleteText(found.getStartOffset(), found.getEndOffsetInclusive());
    const parent = textEl.getParent();
    if (parent.getType() === DocumentApp.ElementType.LIST_ITEM) {
      parent.asListItem().appendPageBreak();
    } else {
      parent.asParagraph().appendPageBreak();
    }
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Optional: run once from the editor to test without the website. */
function testRun() {
  const sample = {
    format: 'pdf', name: 'ಪರೀಕ್ಷೆ ಹೆಸರು', pran: '110012345678', gpf: 'GPF123', doj: '01.06.2015',
    institution: 'ಪಶು ಚಿಕಿತ್ಸಾಲಯ', institutionplace: 'ಹೊರಳಹಳ್ಳಿ', taluk: 'ತಾಲ್ಲೂಕು', district: 'ಜಿಲ್ಲೆ',
    treasuryoffi: 'ಉಪನಿರ್ದೇಶಕರು', treasury: 'ಜಿಲ್ಲಾ ಖಜಾನೆ', treasuryloc: 'ಸ್ಥಳ',
    today: '11.10.2026', tono: '12'
  };
  const out = JSON.parse(doPost({ postData: { contents: JSON.stringify(sample) } }).getContent());
  Logger.log(out.ok ? 'OK, ' + out.filename + ' (' + out.base64.length + ' base64 chars)' : out.error);
}
