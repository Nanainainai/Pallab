import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Calendar,
  Tag,
  FileDown,
  Printer,
  Send,
  Save,
  Edit3,
  FileText,
  X,
  Plus,
} from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import { bn } from "date-fns/locale";
import TextEditor from "./text-editor";
import Boilerplate from "./letter-boilerplate";
import HybridInput, { renderStandardInput } from "./hybrid-input";
import { invoke } from "@tauri-apps/api/core";
import { buildPdfDocument, buildPdfFromElements, printPdfSilent } from "../lib/pdfExport";
import {
  getOptions,
  getDafter,
  autofillPerson,
} from "../lib/amelaInfo";
import {
  BENGALI_MONTHS,
  toBanglaDigits,
  fromBanglaDigits,
  parseStoredDate,
  storeDate,
  prettyStoredDate,
  calculateFiscalYear,
  loadJsonDataFile,
  getSenderPrefix,
  getSubjectsForDafter,
  getTemplate,
  clone,
} from "../lib/letterUtils";

registerLocale("bn", bn);

const displayDate = "dd MMMM, yyyy";

const DAFTER_ORDER = [
  "সদর", "তাজনীদ", "এতেমাদ", "তরবিয়ত", "নও মোবাঈন", "রিশতানাতা",
  "তাবলীগ", "তালীম", "ওয়াকারে আমল", "মাল", "তাহরিকে জাদীদ", "ওয়াকফে জাদীদ",
  "সানাত এ তেজারাত", "উমুরে তোলাবা", "খেদমতে খালক", "সেহতে জিসমানী",
  "ইশায়াত", "আতফাল", "উমুমী", "ওয়াকফে নও", "মোহাসেব",
];

const sortDaftersByHierarchy = (list) =>
  [...list].sort((a, b) => {
    const ia = DAFTER_ORDER.indexOf(a);
    const ib = DAFTER_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return String(a).localeCompare(String(b), "bn");
  });

const extractVariableMap = (variables) => {
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

const rendercontent = (content, variables = {}) => {
  let output = "";

  if (typeof content === "string") {
    output = content;
  } else if (content && typeof content === "object") {
    const generateHTML = (node, previousNode = null, nextNode = null) => {
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
            generateHTML(child, array[index - 1], array[index + 1])
          )
          .join("")
        : "";

      switch (node.type) {
        case "doc":
          return (node.content ?? [])
            .map((child, index, array) =>
              generateHTML(child, array[index - 1], array[index + 1])
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
    let value = variable && typeof variable === "object"
      ? variable.value ?? ""
      : variable ?? "";
    if (variable?.type === "number") value = toBanglaDigits(value);
    output = output.replaceAll(`{{${name}}}`, value);
  });

  return output;
};

const createDefaultSubject = () => ({
  subject: "",
  letterType: "",
  content: "",
  variables: {},
  attachments: [],
  cosmetics: { greeting: "", farewell: "", quote: { text: "", author: "" } },
});

const ScaledBoilerplate = ({ letter, isAttachment = false, attachmentData = null, pageRef = null }) => {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;
    const PAGE_WIDTH_PX = 210 * 3.7795; // 210mm at 96 CSS px/in ≈ 794px
    const updateScale = () => {
      const containerWidth = containerRef.current.clientWidth;
      setScale(Math.min(1, containerWidth / PAGE_WIDTH_PX));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full">
      <Boilerplate
        formValues={letter}
        isAttachment={isAttachment}
        attachmentData={attachmentData}
        previewScale={scale}
        pageRef={pageRef}
      />
    </div>
  );
};

function DatabaseLetterEditor({ initialLetter, onClose, onSaved }) {
  const [templatesData, setTemplatesData] = useState({});
  const [jamaatData, setJamaatData] = useState({});
  const [cosmeticsData, setCosmeticsData] = useState({});
  const [formValues, setFormValues] = useState(() => clone(initialLetter || {}));
  const [history, setHistory] = useState(() => [clone(initialLetter || {})]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [subjects, setSubjects] = useState(() => {
    const source = Array.isArray(initialLetter?.subjects) ? initialLetter.subjects : [];
    return source.length ? clone([source[0]]) : [createDefaultSubject()];
  });
  const [onulipi, setOnulipi] = useState(() => {
    return Array.isArray(initialLetter?.onulipi) && initialLetter.onulipi.length
      ? clone(initialLetter.onulipi)
      : [{ holder: "অফিস কপি", department: "", jamaat: "", reach: "" }];
  });
  const [currentDafter, setCurrentDafter] = useState(initialLetter?.dafter || "");
  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState(1);
  const [previewImage, setPreviewImage] = useState(null);

  const formRef = useRef(null);
  const containerRef = useRef(null);
  const letterRef = useRef(null);
  const letterRefs = useRef([{}]);
  const dialogRef = useRef(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const load = async () => {
      try {
        try { await invoke("init_cosmetics_default"); } catch { }
        const [templates, jamaat, cosmetics] = await Promise.all([
          loadJsonDataFile("templates.json"),
          loadJsonDataFile("jamaat.json"),
          loadJsonDataFile("cosmetics.json"),
        ]);
        setTemplatesData(templates || {});
        setJamaatData(jamaat || {});
        setCosmeticsData(cosmetics || {});
      } catch (error) {
        console.error("Failed to load configuration JSON files:", error);
      }
    };
    load();
  }, []);

  const getRandomCosmetics = () => {
    const pick = (list, fallback) => Array.isArray(list) && list.length
      ? list[Math.floor(Math.random() * list.length)]
      : fallback;
    return {
      greeting: pick(cosmeticsData.greetings, ""),
      farewell: pick(cosmeticsData.farewell, ""),
      quote: pick(cosmeticsData.quote, { text: "", author: "" }),
    };
  };

  const subject = subjects[0] || createDefaultSubject();
  const availableSubjects = getSubjectsForDafter(templatesData, formValues.dafter || currentDafter);
  const letterTypeOptions = [...new Set(Object.values(templatesData).map((template) => template?.letterType).filter(Boolean))];
  const calculatedPrefix = getSenderPrefix(formValues["sender-department"], formValues["sender-jamaat"]);

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      if (formValues.dafter) {
        if (active) setCurrentDafter(formValues.dafter);
        return;
      }
      const dafter = await getDafter({
        reach: formValues["sender-reach"],
        jamaat: formValues["sender-jamaat"],
        department: formValues["sender-department"],
        title: formValues["sender-title"],
        name: formValues.sender,
      });
      if (active) setCurrentDafter(dafter || "");
    };
    resolve();
    return () => { active = false; };
  }, [formValues.dafter, formValues["sender-reach"], formValues["sender-jamaat"], formValues["sender-department"], formValues["sender-title"], formValues.sender]);

  useEffect(() => {
    const fy = calculateFiscalYear(formValues.date, formValues["sender-department"] || "");
    setFormValues((previous) =>
      previous["fy-start"] === fy.start && previous["fy-end"] === fy.end
        ? previous
        : { ...previous, "fy-start": fy.start, "fy-end": fy.end }
    );
  }, [formValues.date, formValues["sender-department"]]);

  useEffect(() => {
    setFormValues((previous) => ({ ...previous, subjects: clone(subjects), onulipi: clone(onulipi) }));
  }, [subjects, onulipi]);

  useEffect(() => {
    setOnulipi((previous) => {
      if (!previous.length) return previous;
      const updated = clone(previous);
      updated[0] = {
        ...updated[0],
        reach: formValues["sender-reach"] || updated[0].reach,
        department: formValues["sender-department"] || updated[0].department,
        jamaat: formValues["sender-jamaat"] || updated[0].jamaat,
      };
      return updated;
    });
  }, [formValues["sender-reach"], formValues["sender-department"], formValues["sender-jamaat"]]);

  const updateForm = (nextValues) => {
    const next = clone(nextValues);
    const nextHistory = history.slice(0, historyIndex + 1);
    setHistory([...nextHistory, next]);
    setHistoryIndex(nextHistory.length);
    setFormValues(next);
  };

  const internalHandleInput = async (event) => {
    let value = event.target.value;
    if (typeof value === "string") {
      if (event.target.name === "letter-no") value = fromBanglaDigits(value).replace(/\D/g, "");
      value = toBanglaDigits(value);
    }
    updateForm(await autofillPerson(formValues, event.target.name, value));
  };

  const updateOnulipi = (index, field, value) => {
    const updated = clone(onulipi);
    updated[index] = { ...updated[index], [field]: value };
    setOnulipi(updated);
  };

  const updateSubject = (field, value) => {
    const updated = clone(subjects);
    updated[0] = { ...(updated[0] || createDefaultSubject()), [field]: value };

    if (field === "subject") {
      const template = getTemplate(templatesData, value);
      updated[0].letterType = template?.letterType || "";
      updated[0].variables = template ? clone(template.variables || {}) : {};
      updated[0].content = template?.body ?? template?.content ?? "";
      updated[0].cosmetics = updated[0].cosmetics?.greeting ? updated[0].cosmetics : getRandomCosmetics();
    }

    setSubjects([updated[0]]);
  };

  const updateVariable = (name, value) => {
    const updated = clone(subjects);
    const current = updated[0] || createDefaultSubject();
    current.variables = current.variables || {};
    if (current.variables[name] && typeof current.variables[name] === "object") {
      current.variables[name].value = value;
    } else {
      current.variables[name] = { type: current.variables[name] || "text", value };
    }
    updated[0] = current;
    setSubjects([current]);
  };

  const updateAttachment = (index, field, value) => {
    const updated = clone(subjects);
    const current = updated[0] || createDefaultSubject();
    current.attachments = current.attachments || [];
    if (!current.attachments[index]) return;
    current.attachments[index][field] = value;
    updated[0] = current;
    setSubjects([current]);
  };

  const addAttachment = () => {
    const updated = clone(subjects);
    const current = updated[0] || createDefaultSubject();
    current.attachments = [...(current.attachments || []), { annexCode: "", content: "" }];
    updated[0] = current;
    setSubjects([current]);
  };

  const removeAttachment = (index) => {
    const updated = clone(subjects);
    const current = updated[0] || createDefaultSubject();
    current.attachments = (current.attachments || []).filter((_, i) => i !== index);
    updated[0] = current;
    setSubjects([current]);
  };

  const normalizeLetterNo = (value) => {
    value = fromBanglaDigits(value).replace(/\D/g, "");
    return value === "" ? "" : toBanglaDigits(value);
  };

  const finalizeLetterNo = (value) => {
    value = fromBanglaDigits(value).replace(/\D/g, "");
    return value === "" ? "" : toBanglaDigits(value.padStart(2, "0"));
  };

  const getInputs = () => {
    if (!formRef.current) return [];
    return Array.from(formRef.current.querySelectorAll("input, select, textarea")).filter((element) => !element.disabled && element.type !== "hidden");
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target.isContentEditable || event.target.tagName === "TEXTAREA") return;
      const inputs = getInputs();
      const currentIndex = inputs.indexOf(document.activeElement);

      if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        if (currentIndex < inputs.length - 1) inputs[currentIndex + 1].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (currentIndex > 0) inputs[currentIndex - 1].focus();
      }

      if (event.ctrlKey && !event.shiftKey) {
        if (event.key === "z" && historyIndex > 0) {
          const previous = history[historyIndex - 1];
          setHistoryIndex(historyIndex - 1);
          setFormValues(clone(previous));
        } else if (event.key === "y" && historyIndex < history.length - 1) {
          const next = history[historyIndex + 1];
          setHistoryIndex(historyIndex + 1);
          setFormValues(clone(next));
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history, historyIndex, formValues]);

  const previewLetter = subject.subject?.trim()
    ? {
      sender: formValues.sender,
      senderTitle: formValues["sender-title"],
      senderDepartment: formValues["sender-department"],
      senderJamaat: formValues["sender-jamaat"],
      senderReach: formValues["sender-reach"],
      senderPrefix: calculatedPrefix,
      department: formValues.dafter || currentDafter || "",
      fyStart: toBanglaDigits(formValues["fy-start"] || ""),
      fyEnd: toBanglaDigits(formValues["fy-end"] || ""),
      letterNo: toBanglaDigits(formValues["letter-no"] || ""),
      date: prettyStoredDate(formValues.date),
      receiverTitle: formValues["receiver-title"],
      receiverDepartment: formValues["receiver-department"],
      receiverJamaat: formValues["receiver-jamaat"],
      receiverReach: formValues["receiver-reach"],
      subject: subject.subject,
      letterType: subject.letterType,
      body: rendercontent(subject.content, subject.variables),
      variables: subject.variables,
      onulipi,
      cosmetics: subject.cosmetics,
      attachments: (subject.attachments || []).map((attachment) => ({
        annexCode: attachment.annexCode,
        body: rendercontent(attachment.content, subject.variables),
      })),
    }
    : null;

  const canPreview = mounted && previewLetter &&
    previewLetter.sender &&
    previewLetter.senderTitle &&
    previewLetter.senderDepartment &&
    previewLetter.senderJamaat &&
    previewLetter.receiverTitle &&
    previewLetter.receiverDepartment &&
    previewLetter.receiverJamaat &&
    previewLetter.subject &&
    previewLetter.letterNo &&
    previewLetter.fyStart &&
    previewLetter.fyEnd &&
    previewLetter.date;

  const BengaliInput = React.forwardRef((props, ref) => {
    const labelText = props.placeholder || props.placeholderText;
    const inputTitle = labelText ? `${labelText}: ${props.value || ''}` : undefined;
    return (
      <input {...props} ref={ref} value={toBanglaDigits(props.value)} title={inputTitle} className="w-full cursor-none" readOnly />
    );
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateScale = () => {
      const containerWidth = containerRef.current.clientWidth;
      const pageWidth = 210 * 3.7795; // 210mm at 96 CSS px/in ≈ 794px
      setScale(Math.min(1, containerWidth / pageWidth));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [canPreview]);

  const getLetterPages = () => {
    const refs = letterRefs.current[0];
    if (!refs) return [];
    return [refs.main, ...(refs.attachments || [])].filter(Boolean);
  };

  const elementsToPdfBase64 = (elements) => buildPdfFromElements(elements);

  const handleSave = async () => {
    const saved = stripLetterMeta(formValues);
    saved.subjects = [clone(subject)];
    saved.onulipi = clone(onulipi);
    saved.dafter = formValues.dafter || currentDafter || "";
    delete saved.department;
    await invoke("save_letter", { formValues: saved });
    await onSaved?.();
  };

  const handleSaveToPdf = async () => {
    try {
      const pages = getLetterPages();
      if (!pages.length) return;
      const pdfBase64 = await elementsToPdfBase64(pages);
      const document = {
        "letter-no": formValues["letter-no"] || "",
        date: subject.date || formValues["date"] || "",
        subjects: [{ subject: subject.subject || "Letter" }],
      };
      await invoke("save_pdf_to_temp", {
        pdfBase64,
        kind: "letter",
        document,
      });
    } catch (error) {
      console.error("Save to PDF failed:", error);
    }
  };

  const handlePrintAndSave = async () => {
    try {
      const pdfBase64 = await elementsToPdfBase64(getLetterPages());
      await handleSave();
      await printPdfSilent(pdfBase64);
    } catch (error) {
      console.error("Print/Save failed:", error);
    }
  };

  const getEmailFromHierarchy = (reach, jamaat, department) =>
    jamaatData?.[reach?.trim()]?.[jamaat?.trim()]?.[department?.trim()]?.email || "";

  const handleSend = async () => {
    try {
      await handleSave();
      let password = localStorage.getItem("smtp_app_password") || "";
      if (!password) {
        password = window.prompt("ইমেইল পাঠানোর জন্য App Password টি লিখুন:");
        if (!password) return;
        password = password.trim();
        localStorage.setItem("smtp_app_password", password);
      }
      const pdfBase64 = await elementsToPdfBase64(getLetterPages());
      await invoke("send_email_with_pdf", {
        fromEmail: getEmailFromHierarchy(formValues["sender-reach"], formValues["sender-jamaat"], formValues["sender-department"]),
        toEmail: getEmailFromHierarchy(formValues["receiver-reach"], formValues["receiver-jamaat"], formValues["receiver-department"]),
        appPassword: password,
        subject: subject.subject || "Letter Document",
        pdfBase64,
      });
      alert("ইমেইল পাঠানো হয়েছে!");
    } catch (error) {
      console.error("Email dispatch failed:", error);
    }
  };

  const variableRows = [];
  const variables = Object.entries(subject.variables || {});
  for (let i = 0; i < variables.length; i += 3) variableRows.push(variables.slice(i, i + 3));

  const renderVariableInput = (name, variable) => {
    const type = typeof variable === "object" && variable !== null ? variable.type : variable;
    const value = typeof variable === "object" && variable !== null ? variable.value || "" : "";

    switch (type) {
      case "number":
      case "phone":
        return renderStandardInput(
          name,
          name,
          toBanglaDigits(value),
          (e) => updateVariable(name, fromBanglaDigits(e.target.value).replace(/\D/g, "")),
          { className: "w-full font-bengali" }
        );
      case "currency":
      case "money":
        return (
          <div className="flex flex-col w-full min-w-0">
            <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">{name}</label>
            <div className="relative flex items-center w-full">
              <input placeholder={name} value={toBanglaDigits(value)} title={`${name}: ${value}`} onChange={(e) => updateVariable(name, fromBanglaDigits(e.target.value).replace(/\D/g, ""))} className="pr-12 w-full font-bengali" />
              <span className="right-2 absolute font-bengali text-gray-500 text-sm pointer-events-none">৳</span>
            </div>
          </div>
        );
      case "dafter":
        return <HybridInput optionsFetcher={() => getOptions("dafter")} placeholderInitial={name} defaultValue={name} value={value} onChange={(e) => updateVariable(name, e.target.value)} />;
      case "reach":
        return <HybridInput optionsFetcher={() => getOptions("reach")} placeholderInitial={name} defaultValue={name} value={value} onChange={(e) => updateVariable(name, e.target.value)} />;
      case "jamaat":
        return <HybridInput optionsFetcher={() => getOptions("jamaat", { reach: formValues["sender-reach"] })} placeholderInitial={name} defaultValue={name} value={value} onChange={(e) => updateVariable(name, e.target.value)} />;
      case "organization":
      case "department":
        return <HybridInput optionsFetcher={() => getOptions("department", { reach: formValues["sender-reach"], jamaat: formValues["sender-jamaat"] })} placeholderInitial={name} defaultValue={name} value={value} onChange={(e) => updateVariable(name, e.target.value)} />;
      case "designation":
      case "title":
        return <HybridInput optionsFetcher={() => getOptions("title", { reach: formValues["sender-reach"], jamaat: formValues["sender-jamaat"], department: formValues["sender-department"] })} placeholderInitial={name} defaultValue={name} value={value} onChange={(e) => updateVariable(name, e.target.value)} />;
      case "name":
        return <HybridInput optionsFetcher={() => getOptions("name", { reach: formValues["sender-reach"], jamaat: formValues["sender-jamaat"], department: formValues["sender-department"], title: formValues["sender-title"] })} placeholderInitial={name} defaultValue={name} value={value} onChange={(e) => updateVariable(name, e.target.value)} />;
      case "month":
        return <HybridInput optionsFetcher={BENGALI_MONTHS} placeholderInitial={name} defaultValue={name} value={value} onChange={(e) => updateVariable(name, e.target.value)} />;
      case "date":
        return (
          <div className="flex flex-col w-full min-w-0">
            <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">{name}</label>
            <DatePicker
              customInput={<BengaliInput placeholder={name} className="w-full" />}
              selected={parseStoredDate(value)}
              onChange={(date) => date && updateVariable(name, storeDate(date))}
              locale="bn"
              dateFormat={displayDate}
              placeholderText={name}
              wrapperClassName="w-full"
              className="w-full cursor-none"
            />
          </div>
        );
      case "time":
        return renderStandardInput(
          name,
          name,
          value,
          (e) => updateVariable(name, e.target.value),
          { type: "time", className: "w-full font-bengali" }
        );
      case "weekday":
      case "day":
        return <HybridInput optionsFetcher={["রবিবার", "সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার"]} placeholderInitial={name} defaultValue={name} value={value} onChange={(e) => updateVariable(name, e.target.value)} />;
      case "email":
        return renderStandardInput(
          name,
          name,
          value,
          (e) => updateVariable(name, e.target.value),
          { type: "email", className: "w-full" }
        );
      default:
        return <HybridInput optionsFetcher={[]} type={type} placeholderInitial={name} defaultValue={name} value={value} onChange={(e) => updateVariable(name, e.target.value)} />;
    }
  };

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="w-full">
      <div className="separator">প্রাপক</div>
      <HybridInput name="receiver-reach" data-default="কেন্দ্রীয়" placeholderInitial="প্রাপকের ধরণ" defaultValue="কেন্দ্রীয়" optionsFetcher={() => getOptions("reach")} onChange={internalHandleInput} value={formValues["receiver-reach"] || ""} className="w-full font-bengali" />
      <div className="gap-x-2 grid grid-cols-[1fr_2fr] w-full">
        <HybridInput name="receiver-title" data-default="সদর" placeholderInitial="পদবী" defaultValue="সদর" optionsFetcher={() => getOptions("title", { reach: formValues["receiver-reach"], jamaat: formValues["receiver-jamaat"], department: formValues["receiver-department"] })} value={formValues["receiver-title"] || ""} onChange={internalHandleInput} />
        <HybridInput name="receiver" data-default="মোস্তাক আহমদ" placeholderInitial="নাম" defaultValue="মোস্তাক আহমদ" optionsFetcher={() => getOptions("name", { reach: formValues["receiver-reach"], jamaat: formValues["receiver-jamaat"], department: formValues["receiver-department"], title: formValues["receiver-title"] })} value={formValues.receiver || ""} onChange={internalHandleInput} />
      </div>
      <div className="gap-x-2 grid grid-cols-2 w-full">
        <HybridInput name="receiver-department" data-default="মজলিস খোদ্দামুল আহমীয়া" placeholderInitial="সংগঠন" defaultValue="মজলিস খোদ্দামুল আহমীয়া" optionsFetcher={() => getOptions("department", { reach: formValues["receiver-reach"], jamaat: formValues["receiver-jamaat"] })} value={formValues["receiver-department"] || ""} onChange={internalHandleInput} />
        <HybridInput name="receiver-jamaat" data-default="বাংলাদেশ" placeholderInitial="জামা'ত" defaultValue="বাংলাদেশ" optionsFetcher={() => getOptions("jamaat", { reach: formValues["receiver-reach"] })} value={formValues["receiver-jamaat"] || ""} onChange={internalHandleInput} />
      </div>

      <div className="separator">প্রেরক</div>
      <HybridInput name="sender-reach" data-default="স্থানীয়" placeholderInitial="প্রেরকের ধরণ" defaultValue="স্থানীয়" optionsFetcher={() => getOptions("reach")} onChange={internalHandleInput} value={formValues["sender-reach"] || ""} className="p-0 w-full font-bengali" />
      <div className="gap-x-2 grid grid-cols-2 w-full">
        <HybridInput name="sender-department" data-default="মজলিস খোদ্দামুল আহমীয়া" placeholderInitial="সংগঠন" defaultValue="মজলিস খোদ্দামুল আহমীয়া" optionsFetcher={() => getOptions("department", { reach: formValues["sender-reach"], jamaat: formValues["sender-jamaat"] })} value={formValues["sender-department"] || ""} onChange={internalHandleInput} />
        <HybridInput name="sender-jamaat" data-default="বাংলাদেশ" placeholderInitial="জামা'ত" defaultValue="বাংলাদেশ" optionsFetcher={() => getOptions("jamaat", { reach: formValues["sender-reach"] })} value={formValues["sender-jamaat"] || ""} onChange={internalHandleInput} />
      </div>
      <div className="gap-x-2 grid grid-cols-[1fr_2fr] w-full">
        <HybridInput name="sender-title" data-default="পদবী" placeholderInitial="পদবী" defaultValue="সহকারী তবলীগ" optionsFetcher={() => getOptions("title", { reach: formValues["sender-reach"], jamaat: formValues["sender-jamaat"], department: formValues["sender-department"] })} value={formValues["sender-title"] || ""} onChange={internalHandleInput} />
        <HybridInput name="sender" data-default="শাহ নাদিম আহমদ" placeholderInitial="নাম" defaultValue="নাম" optionsFetcher={() => getOptions("name", { reach: formValues["sender-reach"], jamaat: formValues["sender-jamaat"], department: formValues["sender-department"], title: formValues["sender-title"] })} value={formValues.sender || ""} onChange={internalHandleInput} />
      </div>

      <div className="separator">অনুলিপি</div>
      {onulipi.map((entry, index) => (
        <div key={index}>
          <div className="gap-x-2 grid grid-cols-[0.2fr_1fr]">
            <HybridInput name={`onulipi-reach-${index}`} placeholderInitial="অনুলিপির ধরণ" defaultValue="কেন্দ্রীয়" value={entry.reach || ""} readOnly={index === 0} optionsFetcher={() => getOptions("reach")} onChange={(e) => updateOnulipi(index, "reach", e.target.value)} />
            <HybridInput name={`onulipi-holder-${index}`} placeholderInitial="অনুলিপি প্রাপক" defaultValue="অনুলিপি প্রাপক" optionsFetcher={["রিজিওনাল কায়েদ"]} value={entry.holder || ""} readOnly={index === 0} onChange={(e) => updateOnulipi(index, "holder", e.target.value)} />
          </div>
          <div className="gap-x-2 grid grid-cols-2">
            <HybridInput name={`onulipi-dept-${index}`} placeholderInitial="সংগঠন" defaultValue="মজলিস খোদ্দামুল আহমীয়া" value={entry.department || ""} readOnly={index === 0} optionsFetcher={() => getOptions("department", { reach: entry.reach, jamaat: entry.jamaat })} onChange={(e) => updateOnulipi(index, "department", e.target.value)} />
            <HybridInput name={`onulipi-jamaat-${index}`} placeholderInitial="জামা'ত" defaultValue="নারায়ণগঞ্জ" value={entry.jamaat || ""} readOnly={index === 0} optionsFetcher={() => getOptions("jamaat", { reach: entry.reach })} onChange={(e) => updateOnulipi(index, "jamaat", e.target.value)} />
          </div>
          {index === onulipi.length - 1 && (
            <button type="button" title="নতুন অনুলিপি যোগ করুন" onClick={() => setOnulipi([...onulipi, { holder: "", department: "", jamaat: "", reach: "" }])} className="w-full"><Plus /></button>
          )}
        </div>
      ))}

      <div className="separator">তথ্য</div>
      <div className="gap-x-2 grid grid-cols-[1fr_1.5fr_1fr_0.5fr_2fr] w-full">
        {renderStandardInput("sender-prefix", "সংক্ষিপ্ত রূপ", calculatedPrefix, undefined, { readOnly: true, className: "w-full font-bengali" })}
        <div className="flex flex-row gap-x-1 w-full">
          {renderStandardInput("fy-start", "অ. শুরু", formValues["fy-start"] || "", undefined, { readOnly: true, className: "w-full" })}
          {renderStandardInput("fy-end", "অ. শেষ", formValues["fy-end"] || "", undefined, { readOnly: true, className: "w-full" })}
        </div>
        <HybridInput name="department" optionsFetcher={() => getOptions("dafter")} placeholderInitial="দপ্তরের নাম" defaultValue="দপ্ত" value={formValues.dafter ?? currentDafter} onChange={(e) => updateForm({ ...formValues, dafter: e.target.value })} className="w-full" />
        {renderStandardInput(
          "letter-no",
          "চিঠি নং",
          formValues["letter-no"] || "",
          (e) => internalHandleInput({ target: { name: "letter-no", value: normalizeLetterNo(e.target.value) } }),
          {
            className: "w-full",
            onBlur: (e) => internalHandleInput({ target: { name: "letter-no", value: finalizeLetterNo(e.target.value) } })
          }
        )}
        <div className="flex flex-col w-full min-w-0">
          <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">তারিখ</label>
          <DatePicker selected={parseStoredDate(formValues.date)} customInput={<BengaliInput placeholder="তারিখ" />} onChange={(date) => date && internalHandleInput({ target: { name: "date", value: storeDate(date) } })} locale="bn" dateFormat={displayDate} placeholderText="তারিখ" className="w-full cursor-none" />
        </div>
      </div>

      <div className="w-full">
        <div className="mb-4">
          <div className="items-center gap-2 grid grid-cols-[1fr_2fr]">
            <HybridInput name="letterType-0" autoComplete="off" placeholderInitial="ধরন" defaultValue="ধরন" optionsFetcher={letterTypeOptions} value={subject.letterType || ""} onChange={(e) => updateSubject("letterType", e.target.value)} className="w-full font-bengali" />
            <HybridInput name="subject-0" autoComplete="off" placeholderInitial="বিষয়" defaultValue="বিষয়" optionsFetcher={availableSubjects} value={subject.subject || ""} onChange={(e) => updateSubject("subject", e.target.value)} className="w-full font-bengali" />
          </div>
        </div>
      </div>

      {subject.subject?.trim() && (
        <div>
          <div className="separator">বিস্তারিত</div>
          <div className="mb-6">
            <div className="mb-2 font-bengali font-bold">{subject.subject}</div>
            {variableRows.map((row, rowIndex) => {
              const cols = row.length === 1 ? "grid-cols-1" : row.length === 2 ? "grid-cols-2" : "grid-cols-3";
              return <div key={rowIndex} className={`grid ${cols} gap-2 mb-2`}>{row.map(([name, variable]) => <div key={name} className="w-full">{renderVariableInput(name, variable)}</div>)}</div>;
            })}
            <TextEditor value={subject.content} placeholder="মূল লেখা..." onChange={(content) => updateSubject("content", content)} />
            {(subject.attachments || []).map((attachment, attachmentIndex) => (
              <div key={attachmentIndex} className="mb-4 border-b">
                {renderStandardInput(
                  `annexCode-${attachmentIndex}`,
                  "সংযুক্তি কোড",
                  attachment.annexCode || "",
                  (e) => updateAttachment(attachmentIndex, "annexCode", e.target.value),
                  { className: "w-full" }
                )}
                <TextEditor value={attachment.content} placeholder="সংযুক্তি..." onRemoveAttachment={() => removeAttachment(attachmentIndex)} onChange={(content) => updateAttachment(attachmentIndex, "content", content)} />
              </div>
            ))}
            <button type="button" className="w-full" title="সংযুক্তি যোগ করুন" onClick={addAttachment}><Plus /></button>
          </div>
        </div>
      )}

      {canPreview && (
        <div ref={(el) => { containerRef.current = el; letterRef.current = el; }} className="w-full print-area">
          <Boilerplate
            formValues={previewLetter}
            previewScale={scale}
            pageRef={(el) => {
              letterRefs.current[0] = letterRefs.current[0] || {};
              letterRefs.current[0].main = el;
            }}
          />
          {(previewLetter.attachments || []).map((attachment, index) => (
            <div key={`attachment-${index}`} className="mt-10 page-break">
              <Boilerplate
                formValues={previewLetter}
                isAttachment
                attachmentData={attachment}
                previewScale={scale}
                pageRef={(el) => {
                  letterRefs.current[0] = letterRefs.current[0] || {};
                  letterRefs.current[0].attachments = letterRefs.current[0].attachments || [];
                  letterRefs.current[0].attachments[index] = el;
                }}
              />
            </div>
          ))}
        </div>
      )}

      <dialog ref={dialogRef}>
        <img src={previewImage} onClick={() => dialogRef.current?.close()} alt="Preview" />
      </dialog>

      <div className="absolute flex justify-end gap-0.5">
        <button type="button" onClick={onClose} title="ফিরে যান"><X /></button>
        <button type="button" onClick={handleSaveToPdf} title="PDF সংরক্ষণ"><FileText /></button>
        <button type="button" onClick={handleSave} title="সংরক্ষণ"><Save /></button>
        <button type="button" onClick={handlePrintAndSave} title="প্রিন্ট"><Printer /></button>
        <button type="button" onClick={handleSend} title="পাঠান"><Send /></button>
      </div>
    </form>
  );
}

const getLetterKey = (letter, index) => letter?.filepath || letter?.path || letter?.filename || letter?.id || `letter-${index}`;

const parsePathSegments = (filepath = "") => {
  const parts = String(filepath || "").replace(/\\/g, "/").split("/");
  const index = parts.lastIndexOf("পত্র");
  if (index === -1) return {};
  return {
    type: parts[index + 1] || "",
    dafter: parts[index + 2] || "",
    fiscalYear: parts[index + 3] || "",
  };
};

const getLetterMeta = (letter) => {
  const subject = Array.isArray(letter?.subjects)
    ? letter.subjects[0] || {}
    : {};

  const pathInfo = parsePathSegments(
    letter?.filepath ||
    letter?.path ||
    letter?.id ||
    ""
  );

  const dafter =
    letter?.dafter ||
    pathInfo.dafter ||
    "";

  const senderDepartment =
    letter?.["sender-department"] ||
    "";

  const receiverDepartment =
    letter?.["receiver-department"] ||
    "";

  const senderReach =
    letter?.["sender-reach"] ||
    "";

  const receiverReach =
    letter?.["receiver-reach"] ||
    "";

  const storageType =
    pathInfo.type ||
    letter?.type ||
    "";

  const fyStart =
    letter?.["fy-start"] ||
    subject.fyStart ||
    "";

  const fyEnd =
    letter?.["fy-end"] ||
    subject.fyEnd ||
    "";

  const fiscalYear =
    fyStart && fyEnd
      ? `${toBanglaDigits(fyStart)}-${toBanglaDigits(fyEnd)}`
      : letter?.fiscalYear ||
      pathInfo.fiscalYear ||
      "";

  const letterNo = toBanglaDigits(
    letter?.["letter-no"] ||
    subject.letterNo ||
    ""
  );

  const date =
    letter?.date ||
    subject.date ||
    "";

  const senderPrefix = getSenderPrefix(
    senderDepartment,
    letter?.["sender-jamaat"] || ""
  );

  const letterCode = [
    senderPrefix,
    dafter,
    fiscalYear,
    letterNo,
  ]
    .filter(Boolean)
    .join("/");

  const variableEntries = Object.entries(
    extractVariableMap(
      subject.variables || {}
    )
  ).map(([name, variable]) => {
    let value =
      variable &&
        typeof variable === "object"
        ? variable.value ?? ""
        : variable ?? "";

    if (variable?.type === "number") {
      value = toBanglaDigits(value);
    }

    return `${name}: ${value || "—"}`;
  });

  const renderedLetter = {
    sender: letter?.sender || "",
    senderTitle:
      letter?.["sender-title"] || "",
    senderDepartment,
    senderJamaat:
      letter?.["sender-jamaat"] || "",
    senderReach,

    senderPrefix,

    department: dafter,
    dafter,

    fyStart: toBanglaDigits(fyStart),
    fyEnd: toBanglaDigits(fyEnd),
    letterNo,

    date: prettyStoredDate(date),

    receiverTitle:
      letter?.["receiver-title"] || "",
    receiverDepartment,
    receiverJamaat:
      letter?.["receiver-jamaat"] || "",
    receiverReach,

    subject: subject.subject || "",

    letterType:
      subject.letterType || "",

    body: rendercontent(
      subject.content,
      subject.variables
    ),

    variables:
      subject.variables || {},

    onulipi: Array.isArray(letter?.onulipi)
      ? letter.onulipi
      : [],

    cosmetics:
      subject.cosmetics || {},

    attachments:
      (subject.attachments || []).map(
        (attachment) => ({
          annexCode:
            attachment.annexCode || "",
          body: rendercontent(
            attachment.content,
            subject.variables
          ),
        })
      ),
  };

  return {
    subject:
      subject.subject ||
      "শিরোনামহীন চিঠি",

    letterNo,
    letterCode,
    date,
    dafter,

    dafterList: dafter
      ? sortDaftersByHierarchy([dafter])
      : [],

    variables: variableEntries,

    body: renderedLetter.body,

    renderedLetters: [
      renderedLetter
    ],

    storageType,

    documentType:
      subject.letterType || "",

    senderReach,
    receiverReach,

    senderDept:
      senderDepartment,

    receiverDept:
      receiverDepartment,

    fiscalYear,
  };
};

export default function LetterDatabase({ initialLetters = [], DAFTERS = [] }) {
  const [letters, setLetters] = useState(initialLetters);
  const [editingLetter, setEditingLetter] = useState(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("সমস্ত");
  const [selectedReachFilter, setSelectedReachFilter] = useState("সমস্ত");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("সমস্ত");
  const [selectedDafterFilter, setSelectedDafterFilter] = useState("সমস্ত");
  const [selectedFyFilter, setSelectedFyFilter] = useState("সমস্ত");
  const [expandedKeys, setExpandedKeys] = useState({});
  const letterRefs = useRef({});

  const refreshLetters = async () => {
    const result = await invoke("get_all_letters");
    if (Array.isArray(result)) setLetters(result);
  };

  useEffect(() => {
    let active = true;
    invoke("get_all_letters")
      .then((result) => {
        if (active) setLetters(Array.isArray(result) ? result : []);
      })
      .catch((error) => {
        console.error("Failed to load letters database from backend:", error);
        if (active) setLetters(Array.isArray(initialLetters) ? initialLetters : []);
      });
    return () => { active = false; };
  }, [initialLetters]);

  const openEditor = (letter) => setEditingLetter(clone(letter));
  const closeEditor = () => setEditingLetter(null);

  if (editingLetter) {
    return (
      <DatabaseLetterEditor
        initialLetter={editingLetter}
        onClose={closeEditor}
        onSaved={async () => {
          await refreshLetters();
          closeEditor();
        }}
      />
    );
  }

  const metaList = letters.map((letter) => ({
    letter,
    meta: getLetterMeta(letter),
  }));

  const availableReaches = Array.from(
    new Set(
      metaList.flatMap(({ meta }) => {
        const effectiveReach =
          meta.storageType === "প্রাপ্ত"
            ? meta.senderReach
            : meta.receiverReach;

        return [
          effectiveReach,
          meta.senderReach,
          meta.receiverReach,
        ].filter(Boolean);
      })
    )
  );

  const availableDepartments = Array.from(
    new Set(
      metaList.flatMap(({ meta }) => {
        const effectiveDept =
          meta.storageType === "প্রাপ্ত"
            ? meta.senderDept
            : meta.receiverDept;

        return [
          effectiveDept,
          meta.senderDept,
          meta.receiverDept,
        ].filter(Boolean);
      })
    )
  );

  const availableDaftersList =
    sortDaftersByHierarchy(
      Array.from(
        new Set([
          ...(Array.isArray(DAFTERS)
            ? DAFTERS
            : []),

          ...metaList.flatMap(({ meta }) => [
            meta.dafter,
            ...meta.dafterList,
          ]).filter(Boolean),
        ])
      )
    );

  const availableFiscalYears = Array.from(
    new Set(
      metaList
        .map(({ meta }) => meta.fiscalYear)
        .filter(Boolean)
    )
  );

  const filteredLetters = letters.filter(
    (letter) => {
      const meta = getLetterMeta(letter);

      const matchesType =
        selectedTypeFilter === "সমস্ত" ||
        meta.storageType === selectedTypeFilter;

      const effectiveReach =
        meta.storageType === "প্রাপ্ত"
          ? meta.senderReach
          : meta.receiverReach;

      const matchesReach =
        selectedReachFilter === "সমস্ত" ||
        effectiveReach === selectedReachFilter ||
        (
          selectedTypeFilter === "সমস্ত" &&
          (
            meta.senderReach ===
            selectedReachFilter ||
            meta.receiverReach ===
            selectedReachFilter
          )
        );

      const effectiveDept =
        meta.storageType === "প্রাপ্ত"
          ? meta.senderDept
          : meta.receiverDept;

      const matchesDept =
        selectedDeptFilter === "সমস্ত" ||
        effectiveDept === selectedDeptFilter ||
        (
          selectedTypeFilter === "সমস্ত" &&
          (
            meta.senderDept ===
            selectedDeptFilter ||
            meta.receiverDept ===
            selectedDeptFilter
          )
        );

      const matchesDafter =
        selectedDafterFilter === "সমস্ত" ||
        meta.dafter ===
        selectedDafterFilter;

      const matchesFy =
        selectedFyFilter === "সমস্ত" ||
        meta.fiscalYear ===
        selectedFyFilter;

      return (
        matchesType &&
        matchesReach &&
        matchesDept &&
        matchesDafter &&
        matchesFy
      );
    }
  );

  const sortedLetters = [...filteredLetters].sort((a, b) => {
    const metaA = getLetterMeta(a);
    const metaB = getLetterMeta(b);
    const ia = DAFTER_ORDER.indexOf(metaA.dafter);
    const ib = DAFTER_ORDER.indexOf(metaB.dafter);
    if (ia !== ib) {
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return String(metaA.dafter || "").localeCompare(String(metaB.dafter || ""), "bn");
    }
    if (metaA.fiscalYear !== metaB.fiscalYear) return String(metaB.fiscalYear || "").localeCompare(String(metaA.fiscalYear || ""), "bn");
    const na = parseInt(fromBanglaDigits(metaA.letterNo), 10) || 0;
    const nb = parseInt(fromBanglaDigits(metaB.letterNo), 10) || 0;
    if (na !== nb) return nb - na;
    return String(metaB.date || "").localeCompare(String(metaA.date || ""), "bn");
  });

  const toggleExpand = async (letter, event) => {
    event?.stopPropagation();
    const key = getLetterKey(letter, letters.indexOf(letter));
    setExpandedKeys((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  const getPages = async (letter) => {
    const key = getLetterKey(letter, letters.indexOf(letter));
    if (!expandedKeys[key]) {
      setExpandedKeys((previous) => ({ ...previous, [key]: true }));
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return (letterRefs.current[key] || []).filter(Boolean);
  };

  const elementsToPdf = (elements) => buildPdfDocument(elements);

  const handleExportPdf = async (letter, event) => {
    event?.stopPropagation();
    try {
      const pdf = await elementsToPdf(await getPages(letter));
      pdf.save(`${getLetterMeta(letter).subject || "letter"}.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
    }
  };

  const handlePrint = async (letter, event) => {
    event?.stopPropagation();
    try {
      const pdf = await elementsToPdf(await getPages(letter));
      await printPdfSilent(pdf.output("datauristring").split(",")[1]);
    } catch (error) {
      console.error("Print failed:", error);
    }
  };

  const handleSend = async (letter, event) => {
    event?.stopPropagation();
    try {
      const meta = getLetterMeta(letter);
      const pdf = await elementsToPdf(await getPages(letter));
      let password = localStorage.getItem("smtp_app_password") || "";
      if (!password) {
        password = window.prompt("ইমেইল পাঠানোর জন্য App Password টি লিখুন:");
        if (!password) return;
        password = password.trim();
        localStorage.setItem("smtp_app_password", password);
      }
      await invoke("send_email_with_pdf", {
        fromEmail: letter["sender-email"] || "",
        toEmail: letter["receiver-email"] || "",
        appPassword: password,
        subject: meta.subject || "Letter Document",
        pdfBase64: pdf.output("datauristring").split(",")[1],
      });
      alert("ইমেইল পাঠানো হয়েছে!");
    } catch (error) {
      console.error("Email dispatch failed:", error);
    }
  };

  const handleDelete = async (letter, event) => {
    event?.stopPropagation();
    const meta = getLetterMeta(letter);
    if (!window.confirm(`"${meta.subject || "এই চিঠি"}" স্থায়ীভাবে মুছে ফেলতে চান?`)) return;
    const filepath = letter?.filepath || letter?.path;
    if (!filepath) return;
    try {
      await invoke("delete_letter", { filepath });
      setLetters((previous) => previous.filter((item) => (item?.filepath || item?.path) !== filepath));
    } catch (error) {
      console.error("Failed to delete letter:", error);
      alert("চিঠি মুছে ফেলা যায়নি।");
    }
  };

  const renderVariablePills = (variables) => variables?.map((entry, index) => (
    <span key={index} className="flex items-center gap-1 opacity-90 px-1.5 py-0.5 border font-bengali text-xs">
      <Tag className="opacity-60 w-3 h-3" />
      <span className="font-semibold">{entry}</span>
    </span>
  ));

  return (
    <form onSubmit={(e) => e.preventDefault()} className="w-full">
      <div className="gap-x-2 grid grid-cols-[1fr_1fr_2.3fr_1fr_1fr] mb-4 w-full">
        <HybridInput name="filter-type" placeholderInitial="প্রেরিত/প্রাপ্ত" defaultValue="সমস্ত" optionsFetcher={["সমস্ত", "প্রেরিত", "প্রাপ্ত"]} value={selectedTypeFilter} onChange={(e) => setSelectedTypeFilter(e.target.value)} />
        <HybridInput name="filter-reach" placeholderInitial="পর্যায়" defaultValue="সমস্ত" optionsFetcher={["সমস্ত", ...availableReaches]} value={selectedReachFilter} onChange={(e) => setSelectedReachFilter(e.target.value)} />
        <HybridInput name="filter-dept" placeholderInitial="সংগঠন" defaultValue="সমস্ত" optionsFetcher={["সমস্ত", ...availableDepartments]} value={selectedDeptFilter} onChange={(e) => setSelectedDeptFilter(e.target.value)} />
        <HybridInput name="filter-dafter" placeholderInitial="দপ্তর" defaultValue="সমস্ত" optionsFetcher={["সমস্ত", ...availableDaftersList]} value={selectedDafterFilter} onChange={(e) => setSelectedDafterFilter(e.target.value)} />
        <HybridInput name="filter-fy" placeholderInitial="অর্থবছর" defaultValue="সমস্ত" optionsFetcher={["সমস্ত", ...availableFiscalYears]} value={selectedFyFilter} onChange={(e) => setSelectedFyFilter(e.target.value)} />
      </div>

      <div className="separator">সংরক্ষিত চিঠি</div>
      {sortedLetters.length === 0 ? (
        <div className="opacity-70 py-6 font-bengali text-center">কোনো তথ্য পাওয়া যায়নি।</div>
      ) : (
        <div className="space-y-3">
          {sortedLetters.map((letter) => {
            const meta = getLetterMeta(letter);
            const itemKey = getLetterKey(letter, letters.indexOf(letter));
            const isExpanded = !!expandedKeys[itemKey];
            const pages = meta.renderedLetters.flatMap((renderedLetter, rIndex) => [
              { key: `${rIndex}-main`, renderedLetter, isAttachment: false, attachmentData: null },
              ...(renderedLetter.attachments || []).map((attachment, aIndex) => ({ key: `${rIndex}-att-${aIndex}`, renderedLetter, isAttachment: true, attachmentData: attachment })),
            ]);

            return (
              <div key={itemKey} className="border-b">
                <div onClick={() => openEditor(letter)} className="group relative hover:bg-black dark:hover:bg-white p-3 hover:text-white dark:hover:text-black transition-colors cursor-none">
                  <div className="right-2 bottom-2 z-20 absolute flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" title="মুছে ফেলুন" onClick={(e) => handleDelete(letter, e)} className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-6 h-6"><Trash2 className="w-3.5 h-3.5" /></button>
                    <button type="button" title={isExpanded ? "সংকুচিত করুন" : "সম্প্রসারিত করুন"} onClick={(e) => toggleExpand(letter, e)} className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-6 h-6">{isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
                    <button type="button" title="সম্পাদনা" onClick={(e) => { e.stopPropagation(); openEditor(letter); }} className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-6 h-6"><Edit3 className="w-3.5 h-3.5" /></button>
                  </div>

                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bengali font-bold text-xs">{meta.dafter || "সাধারণ"}</span>
                      {meta.letterCode && <span className="opacity-70 pl-2 border-current border-l font-bengali text-xs">{meta.letterCode}</span>}
                    </div>
                    {meta.date && <span className="flex items-center gap-1 opacity-70 font-bengali text-xs"><Calendar className="w-3 h-3" />{meta.date}</span>}
                  </div>

                  <div className="mb-1 font-bengali font-bold text-base">{meta.subject}</div>
                  {meta.documentType && <div className="opacity-60 mb-1 font-bengali text-xs">{meta.documentType}</div>}
                  <div
                    className="opacity-80 mb-2 pr-4 font-bengali text-sm line-clamp-2"
                    dangerouslySetInnerHTML={{
                      __html: rendercontent(
                        letter?.subjects?.[0]?.content,
                        letter?.subjects?.[0]?.variables
                      ),
                    }}
                  />
                  <div className="flex flex-wrap gap-1">{renderVariablePills(meta.variables)}</div>
                </div>

                {isExpanded && (
                  <div onClick={(e) => e.stopPropagation()} className="my-2">
                    <div className="space-y-10">
                      {pages.map((page, pageIndex) => (
                        <ScaledBoilerplate
                          key={page.key}
                          letter={page.renderedLetter}
                          isAttachment={page.isAttachment}
                          attachmentData={page.attachmentData}
                          pageRef={(element) => {
                            if (!letterRefs.current[itemKey]) letterRefs.current[itemKey] = [];
                            letterRefs.current[itemKey][pageIndex] = element;
                          }}
                        />
                      ))}
                    </div>
                    <div className="z-99999999999 flex justify-start items-center gap-2">
                      <button type="button" title="PDF এক্সপোর্ট" onClick={(e) => handleExportPdf(letter, e)} className="z-50 flex justify-center items-center hover:opacity-70 border border-current rounded-full w-7 h-7"><FileDown className="w-3.5 h-3.5" /></button>
                      <button type="button" title="প্রিন্ট" onClick={(e) => handlePrint(letter, e)} className="z-50 flex justify-center items-center hover:opacity-70 border border-current rounded-full w-7 h-7"><Printer className="w-3.5 h-3.5" /></button>
                      <button type="button" title="পাঠান" onClick={(e) => handleSend(letter, e)} className="z-50 flex justify-center items-center hover:opacity-70 border border-current rounded-full w-7 h-7"><Send className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </form>
  );
}