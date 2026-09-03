import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { documentDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { format, parse } from "date-fns";
import { bn } from "date-fns/locale";

export const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

export const BENGALI_MONTHS = [
  "জানুয়ারী",
  "ফেব্রুয়ারী",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

export const toBanglaDigits = (text = "") =>
  String(text).replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)] ?? d);

export const fromBanglaDigits = (text = "") =>
  String(text).replace(
    /[০-৯]/g,
    (d) => String(BENGALI_DIGITS.indexOf(d))
  );

export const parseStoredDate = (value) => {
  if (!value) return null;

  try {
    const parsed = parse(
      fromBanglaDigits(value),
      "dd.MM.yyyy",
      new Date()
    );

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

export const storeDate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime())
    ? format(date, "dd.MM.yyyy")
    : "";

export const prettyStoredDate = (value) => {
  const parsed = parseStoredDate(value);

  if (!parsed) return "";

  return toBanglaDigits(
    format(parsed, "dd MMMM, yyyy", { locale: bn })
  );
};

export const calculateFiscalYear = (dateStr, org = "") => {
  const parsed = parseStoredDate(dateStr) || new Date();

  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;

  const isAuxiliary =
    org.includes("মজলিস খোদ্দামুল আহমদীয়া") ||
    org.includes("মজলিস আতফালুল আহমদীয়া");

  let fyStart = year;
  let fyEnd = year + 1;

  if (isAuxiliary) {
    if (month < 11) {
      fyStart = year - 1;
      fyEnd = year;
    }
  } else {
    if (month < 7) {
      fyStart = year - 1;
      fyEnd = year;
    }
  }

  return {
    start: toBanglaDigits(fyStart),
    end: toBanglaDigits(String(fyEnd).slice(-2)),
  };
};

export const getDataFilePath = async (fileName) => {
  const docPath = await documentDir();
  return join(docPath, "Pallab", "data", fileName);
};

export const loadJsonDataFile = async (fileName, fallback = {}) => {
  try {
    const path = await getDataFilePath(fileName);

    if (!(await exists(path))) {
      return fallback;
    }

    const text = await readTextFile(path);
    return JSON.parse(text);
  } catch (error) {
    console.error(`Failed to load ${fileName}:`, error);
    return fallback;
  }
};

/**
 * Saves a JSON-serializable dataset for one of the app's editors: tries the
 * Tauri backend command first, then falls back to writing the file directly
 * under Pallab/data/ so older installations (without the invoke command yet
 * registered) keep working. This is the save-side counterpart to
 * `loadJsonDataFile` above.
 */
export const saveJsonDataFile = async ({ invokeCommand, invokeArgKey, data, fileName }) => {
  try {
    await invoke(invokeCommand, { [invokeArgKey]: data });
    return;
  } catch (error) {
    try {
      await writeTextFile(`Pallab/data/${fileName}`, JSON.stringify(data, null, 2), {
        baseDir: BaseDirectory.Document,
      });
      return;
    } catch (fallbackError) {
      console.error(`Failed to save ${fileName}:`, error, fallbackError);
      throw fallbackError;
    }
  }
};

export const getSenderPrefix = (department, jamaat) => {
  const PREFIX_MAP = {
    "মজলিস খোদ্দামুল আহমদীয়া": "মখোআ",
    "মজলিস আতফালুল আহমদীয়া": "মআআ",
    "আহমদীয়া মুসলিম জামা'ত": "আমুজা",
  };

  const prefix =
    PREFIX_MAP[department] ??
    department?.slice(0, 2) ??
    "";

  if (!jamaat) return prefix;

  let jamaatShort = "";

  for (let i = 0; i < jamaat.length; i++) {
    const char = jamaat[i];

    if (char === " " || char === "\u00A0") {
      continue;
    }

    jamaatShort += char;

    if (i + 1 < jamaat.length) {
      const nextChar = jamaat[i + 1];
      const code = nextChar.charCodeAt(0);

      if (
        (code >= 0x09be && code <= 0x09cc) ||
        code === 0x09cd
      ) {
        jamaatShort += nextChar;
        i++;

        while (
          i + 1 < jamaat.length &&
          (
            jamaat[i].charCodeAt(0) === 0x09cd ||
            (
              jamaat[i + 1].charCodeAt(0) >= 0x09be &&
              jamaat[i + 1].charCodeAt(0) <= 0x09cc
            )
          )
        ) {
          jamaatShort += jamaat[i + 1];
          i++;
        }
      }
    }

    break;
  }

  return prefix + jamaatShort;
};

export const getTemplate = (templates, subjectName) => {
  if (!subjectName || !Array.isArray(templates)) return null;
  return templates.find((t) => t.title === subjectName) ?? null;
};

export const getTemplateContent = (templates, subject) => {
  const template = getTemplate(templates, subject);
  return template?.body ?? template?.content ?? "";
};

export const getSubjectsForDafter = (templates, dafter) => {
  if (!dafter || !Array.isArray(templates)) return [];

  return templates
    .filter((template) => {
      const dafterValues = Array.isArray(template.dafter)
        ? template.dafter
        : template.dafter
          ? [template.dafter]
          : [];
      return dafterValues.includes(dafter);
    })
    .map((template) => template.title);
};

/* -------------------------------------------------------------------------- */
/* Shared helpers previously duplicated in letter-report / letter-database    */
/* -------------------------------------------------------------------------- */

/** Deep clone that prefers structuredClone and falls back to JSON. */
export const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

/**
 * Normalise template / subject variable maps that may arrive as either
 * an object keyed by name or an array of { name, value } records.
 */
export const extractVariableMap = (variables) => {
  if (!variables) return {};
  if (Array.isArray(variables)) {
    const result = {};
    variables.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const key = item.name || item.key || item.placeholder || item.label;
      if (key) result[key] = item.value ?? item.defaultValue ?? "";
    });
    return result;
  }
  return typeof variables === "object" ? variables : {};
};

/**
 * Render TipTap / ProseMirror JSON (or plain string) to HTML, substituting
 * {{variable}} placeholders. Number-typed values are shown in Bangla digits
 * for display only; the stored value itself is left untouched.
 */
export const renderContent = (content, variables = {}) => {
  let output = "";

  if (typeof content === "string") {
    output = content;
  } else if (content && typeof content === "object") {
    const generateHTML = (node, previousNode = null) => {
      if (!node) return "";

      if (node.type === "text" && typeof node.text === "string") {
        let text = node.text;
        if (Array.isArray(node.marks)) {
          node.marks.forEach((mark) => {
            if (mark.type === "bold") text = `<strong>${text}</strong>`;
            if (mark.type === "italic") text = `<em>${text}</em>`;
            if (mark.type === "underline") text = `<u>${text}</u>`;
          });
        }
        return text;
      }

      if (node.type === "hardBreak") return "<br />";

      const childrenHtml = Array.isArray(node.content)
        ? node.content
          .map((child, index, array) =>
            generateHTML(child, array[index - 1])
          )
          .join("")
        : "";

      switch (node.type) {
        case "doc":
          return (node.content ?? [])
            .map((child, index, array) =>
              generateHTML(child, array[index - 1])
            )
            .join("");
        case "paragraph":
          if (previousNode?.type === "image") {
            return `<div class="-mt-1 mb-5 text-black text-sm text-center">${childrenHtml}</div>`;
          }
          return `<p class="minimal-p">${childrenHtml}</p>`;
        case "bulletList":
          return `<ul class="pl-5 list-disc">${childrenHtml}</ul>`;
        case "orderedList":
          return `<ol class="pl-5 list-decimal">${childrenHtml}</ol>`;
        case "listItem":
          return `<li>${childrenHtml}</li>`;
        case "table":
          return `<div class="flex justify-center my-4 w-full"><table class="mx-auto border border-gray-300 border-collapse">${childrenHtml}</table></div>`;
        case "tableRow":
          return `<tr class="border-gray-300 border-b">${childrenHtml}</tr>`;
        case "tableHeader":
          return `<th class="bg-gray-50 p-2 border border-gray-300 font-bold text-left">${childrenHtml}</th>`;
        case "tableCell":
          return `<td class="p-2 border border-gray-300 text-left">${childrenHtml}</td>`;
        case "image":
          return `<div class="my-2 text-center"><img src="${node.attrs?.src || ""}" class="block mx-auto max-w-[90%] h-auto" /></div>`;
        default:
          return childrenHtml;
      }
    };

    output = generateHTML(content);
  }

  Object.entries(extractVariableMap(variables)).forEach(([name, variable]) => {
    let value =
      variable && typeof variable === "object"
        ? variable.value ?? ""
        : variable ?? "";
    // Display-only conversion: never mutate the stored value.
    if (variable?.type === "number") {
      value = toBanglaDigits(value);
    }
    output = output.replaceAll(`{{${name}}}`, value);
  });

  return output;
};

/** Strip non-digits and keep the result in Bangla digits (for live input). */
export const normalizeLetterNo = (value) => {
  value = fromBanglaDigits(value).replace(/\D/g, "");
  return value === "" ? "" : toBanglaDigits(value);
};

/** Pad letter number to two digits and store in Bangla digits. */
export const finalizeLetterNo = (value) => {
  value = fromBanglaDigits(value).replace(/\D/g, "");
  return value === "" ? "" : toBanglaDigits(value.padStart(2, "0"));
};

/**
 * Keep only digit characters and always store them as Bangla digits.
 * Used for number / phone / currency template variables so the value
 * written into a .letter file never collapses to English digits.
 */
export const normalizeNumericVariable = (raw) => {
  const ascii = fromBanglaDigits(String(raw ?? "")).replace(/\D/g, "");
  return ascii === "" ? "" : toBanglaDigits(ascii);
};

export const createDefaultAttachment = () => ({
  annexCode: "",
  content: "",
});

export const createDefaultSubject = (cosmetics = null) => ({
  subject: "",
  letterType: "",
  content: "",
  variables: {},
  attachments: [],
  cosmetics: cosmetics || {
    greeting: "",
    farewell: "",
    quote: { text: "", author: "" },
  },
});

/**
 * Fields injected by the backend (get_all_letters) or by path resolution
 * that must never be persisted back into a .letter document.
 */
const LETTER_META_KEYS = ["filename", "filepath", "id"];

/**
 * Return a clean copy of formValues suitable for save_letter.
 * Removes filename / filepath / id and other non-document keys.
 */
export const stripLetterMeta = (formValues) => {
  const cleaned = clone(formValues || {});
  for (const key of LETTER_META_KEYS) {
    delete cleaned[key];
  }
  return cleaned;
};