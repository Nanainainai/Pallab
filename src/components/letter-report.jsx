import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, Printer, Send, FileText } from 'lucide-react';
import Boilerplate from './letter-boilerplate';
import HybridInput, { renderStandardInput } from './hybrid-input';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  getOptions,
  getDafter,
  autofillPerson
} from "../lib/amelaInfo";
import { registerLocale } from "react-datepicker";
import { bn } from "date-fns/locale";
import React from 'react';
import { useReactToPrint } from "react-to-print";
import { toPng } from "html-to-image";
import TextEditor from './text-editor';
import { invoke } from "@tauri-apps/api/core";
import { buildPdfFromElements, printPdfSilent } from "../lib/pdfExport";
import { type } from "@tauri-apps/plugin-os";
import {
  BENGALI_MONTHS,
  toBanglaDigits,
  fromBanglaDigits,
  parseStoredDate,
  storeDate,
  calculateFiscalYear,
  getDataFilePath,
  loadJsonDataFile,
  getSenderPrefix,
  getSubjectsForDafter,
  getTemplate,
  prettyStoredDate,
  normalizeNumericVariable
} from "../lib/letterUtils";

registerLocale("bn", bn);

const displayDate = "dd MMMM, yyyy";

const createDefaultAttachment = () => ({
  annexCode: "",
  content: ""
});

export default function Letter({ formValues, setFormValues, handleInput }) {
  const [history, setHistory] = useState([formValues]);
  const [index, setIndex] = useState(0);
  const [onulipi, setOnulipi] = useState(formValues.onulipi || [{ holder: "অফিস কপি", department: "", jamaat: "" }]);
  const [templatesData, setTemplatesData] = useState({});
  const [jamaatData, setJamaatData] = useState({});
  const [cosmeticsData, setCosmeticsData] = useState({});
  const [currentDafter, setCurrentDafter] = useState("");

  const formRef = useRef(null);

  useEffect(() => {
    const loadDataFiles = async () => {
      try {
        try {
          await invoke("init_cosmetics_default");
        } catch (error) {
          console.warn(
            "Cosmetics sync check passed or was unnecessary:",
            error
          );
        }
        const [templates, jamaat, cosmetics] = await Promise.all([
          loadJsonDataFile("templates.json"),
          loadJsonDataFile("jamaat.json"),
          loadJsonDataFile("cosmetics.json"),
        ]);
        setTemplatesData(templates);
        setJamaatData(jamaat);
        setCosmeticsData(cosmetics);
      } catch (error) {
        console.error(
          "Failed to load configuration JSON files:",
          error
        );
      }
    };
    loadDataFiles();
  }, []);

  const getRandomCosmetics = () => {
    const pickRandom = (list, fallback) => {
      if (!Array.isArray(list) || list.length === 0) return fallback;
      return list[Math.floor(Math.random() * list.length)];
    };

    return {
      greeting: pickRandom(cosmeticsData.greetings, ""),
      farewell: pickRandom(cosmeticsData.farewell, ""),
      quote: pickRandom(cosmeticsData.quote, { text: "", author: "" }),
    };
  };

  const createDefaultSubject = () => ({
    subject: "",
    letterType: "",
    content: "",
    variables: {},
    attachments: [],
    cosmetics: getRandomCosmetics(),
  });

  const [subjects, setSubjects] = useState(
    formValues.subjects || [createDefaultSubject()]
  );

  const getFilteredSubjects = (dafter) =>
    getSubjectsForDafter(templatesData, dafter);

  const getSenderFilters = () => ({
    reach: formValues["sender-reach"],
    jamaat: formValues["sender-jamaat"],
    department: formValues["sender-department"],
    title: formValues["sender-title"],
    name: formValues["sender"]
  });

  useEffect(() => {
    let active = true;
    const resolveDafter = async () => {
      if (formValues.department) {
        if (active) setCurrentDafter(formValues.department);
      } else {
        const dafter = await getDafter(getSenderFilters());
        if (active) setCurrentDafter(dafter || "");
      }
    };
    resolveDafter();
    return () => { active = false; };
  }, [
    formValues.department,
    formValues["sender-reach"],
    formValues["sender-jamaat"],
    formValues["sender-department"],
    formValues["sender-title"],
    formValues["sender"]
  ]);

  useEffect(() => {
    const fy = calculateFiscalYear(formValues["date"], formValues["sender-department"] || "");
    setFormValues(prev => {
      if (prev["fy-start"] === fy.start && prev["fy-end"] === fy.end) return prev;
      return {
        ...prev,
        "fy-start": fy.start,
        "fy-end": fy.end
      };
    });
  }, [formValues["date"], formValues["sender-department"]]);

  /*
   * `formValues` is owned by the parent and can be swapped out wholesale —
   * e.g. letter-database's "edit" action replaces it with a different
   * saved letter. `subjects`/`onulipi`/`history` are local state seeded
   * from `formValues` only once (on mount), so without this they'd keep
   * showing whatever was already open instead of the newly loaded record.
   * `filepath`/`id` (injected by get_all_letters) uniquely identify a
   * saved record, so a change there means "load this record fresh"
   * rather than "the user edited a field."
   */
  const editingId = formValues.filepath || formValues.id || null;
  const loadedIdRef = useRef(editingId);
  const skipNextDafterClearRef = useRef(true);

  useEffect(() => {
    if (editingId === loadedIdRef.current) return;
    loadedIdRef.current = editingId;

    setSubjects(
      Array.isArray(formValues.subjects) && formValues.subjects.length
        ? structuredClone(formValues.subjects)
        : [createDefaultSubject()]
    );
    setOnulipi(
      Array.isArray(formValues.onulipi) && formValues.onulipi.length
        ? structuredClone(formValues.onulipi)
        : [{ holder: "অফিস কপি", department: "", jamaat: "" }]
    );
    setHistory([formValues]);
    setIndex(0);

    // The Dafter/template resolution that follows this load shouldn't
    // second-guess the subjects we just loaded (see below).
    skipNextDafterClearRef.current = true;
  }, [editingId]);

  useEffect(() => {
    if (skipNextDafterClearRef.current) {
      skipNextDafterClearRef.current = false;
      return;
    }

    const allowedSubjects = getFilteredSubjects(currentDafter);
    setSubjects(prevSubjects => {
      let changed = false;
      const updated = prevSubjects.map(s => {
        if (s.subject && !allowedSubjects.includes(s.subject)) {
          changed = true;
          return createDefaultSubject();
        }
        return s;
      });
      return changed ? updated : prevSubjects;
    });
  }, [currentDafter, templatesData]);

  const updateForm = (newValues) => {
    const newHistory = history.slice(0, index + 1);
    setHistory([...newHistory, newValues]);
    setIndex(newHistory.length - 1);
    setFormValues(newValues);
  };

  const internalHandleInput = async (e) => {
    let value = e.target.value;

    if (typeof value === "string") {
      if (e.target.name === "letter-no") {
        value = fromBanglaDigits(value);
        value = value.replace(/\D/g, "");
      }

      value = toBanglaDigits(value);
    }

    const newValues = await autofillPerson(
      formValues,
      e.target.name,
      value
    );

    updateForm(newValues);
  };

  const getInputs = () => {
    if (!formRef.current) return [];
    return Array.from(
      formRef.current.querySelectorAll(
        'input, select, textarea'
      )
    ).filter(el => {
      if (el.type === "hidden") return false;
      if (el.disabled) return false;
      return true;
    });
  };

  useEffect(() => {
    setFormValues(prev => ({ ...prev, onulipi }));
  }, [onulipi]);

  useEffect(() => {
    setFormValues(prev => ({
      ...prev,
      subjects
    }));
  }, [subjects]);

  useEffect(() => {
    setOnulipi(prev => {
      const updated = [...prev];
      updated[0] = {
        ...updated[0],
        reach: formValues["sender-reach"] || updated[0].reach,
        department: formValues["sender-department"] || updated[0].department,
        jamaat: formValues["sender-jamaat"] || updated[0].jamaat
      };
      return updated;
    });
  }, [formValues["sender-reach"], formValues["sender-department"], formValues["sender-jamaat"]]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isEditableArea = e.target.isContentEditable || e.target.tagName === 'TEXTAREA';
      const shouldNavigate = isEditableArea
        ? e.key === 'Enter' && e.shiftKey
        : e.key === 'Enter';

      if (shouldNavigate) {
        e.preventDefault();
        const inputs = getInputs();
        const currentIndex = inputs.indexOf(document.activeElement);
        if (currentIndex < inputs.length - 1) inputs[currentIndex + 1].focus();
      }

      if (isEditableArea) return;

      if (e.ctrlKey && !e.shiftKey) {
        if (e.key === 'z' && index > 0) {
          setIndex(i => i - 1);
          setFormValues(history[index - 1]);
        }
        else if (e.key === 'y' && index < history.length - 1) {
          setIndex(i => i + 1);
          setFormValues(history[index + 1]);
        }
      }

      if (e.ctrlKey && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            setIndex(0);
            setFormValues(history[0]);
            setOnulipi(
              history[0].onulipi || [
                {
                  holder: "অফিস কপি",
                  reach: formValues["sender-reach"] || "",
                  department: formValues["sender-department"] || "",
                  jamaat: formValues["sender-jamaat"] || ""
                }
              ]
            );
            setSubjects(history[0].subjects || [createDefaultSubject()]);
            break;

          case 'y':
            setIndex(history.length - 1);
            setFormValues(history[history.length - 1]);
            setOnulipi(
              history[history.length - 1].onulipi || [
                {
                  holder: "অফিস কপি",
                  reach: formValues["sender-reach"] || "",
                  department: formValues["sender-department"] || "",
                  jamaat: formValues["sender-jamaat"] || ""
                }
              ]
            );
            setSubjects(history[history.length - 1].subjects || [createDefaultSubject()]);
            break;

          case '1':
          case '2':
          case '3':
          case '4':
          case '5': {
            const sectionMap = {
              '1': ['receiver-reach', 'receiver', 'receiver-title', 'receiver-field', 'receiver-department', 'receiver-jamaat'],
              '2': ['sender-reach', 'sender', 'sender-title', 'sender-field', 'sender-department', 'sender-jamaat'],
              '4': ['fy-start', 'fy-end', 'letter-no', 'date'],
              '5': ['subject']
            };

            const restored = { ...formValues };

            if (e.key === '3') {
              setOnulipi(
                history[index]?.onulipi || [
                  {
                    holder: "অফিস কপি",
                    reach: formValues["sender-reach"] || "",
                    department: formValues["sender-department"] || "",
                    jamaat: formValues["sender-jamaat"] || ""
                  }
                ]
              );
            } else if (e.key === '5') {
              setSubjects(history[index]?.subjects || [createDefaultSubject()]);
            } else {
              sectionMap[e.key].forEach(field => {
                restored[field] = history[index]?.[field];
              });
            }

            updateForm(restored);
            break;
          }
        }
      }

      if (e.altKey && !e.shiftKey) {
        if (e.key >= '1' && e.key <= '5') {
          const sectionMap = {
            '1': ['receiver-reach', 'receiver', 'receiver-title', 'receiver-field', 'receiver-department', 'receiver-jamaat'],
            '2': ['sender-reach', 'sender', 'sender-title', 'sender-field', 'sender-department', 'sender-jamaat'],
            '4': ['fy-start', 'fy-end', 'letter-no', 'date'],
            '5': ['subject']
          };

          const newValues = { ...formValues };

          if (e.key === '3') {
            setOnulipi([
              {
                holder: "অফিস কপি",
                reach: formValues["sender-reach"] || "",
                department: formValues["sender-department"] || "",
                jamaat: formValues["sender-jamaat"] || ""
              }
            ]);
          } else {
            sectionMap[e.key].forEach(field => delete newValues[field]);
          }

          if (e.key === '5') {
            setSubjects([createDefaultSubject()]);
          }

          updateForm(newValues);
        }
      }

      if (e.altKey && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            updateForm({});
            setOnulipi([
              {
                holder: "অফিস কপি",
                reach: formValues["sender-reach"] || "",
                department: formValues["sender-department"] || "",
                jamaat: formValues["sender-jamaat"] || ""
              }
            ]);
            setSubjects([createDefaultSubject()]);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, index, formValues]);

  const updateOnulipi = (index, field, value) => {
    const newOnulipi = [...onulipi];
    newOnulipi[index][field] = value;
    setOnulipi(newOnulipi);
  };

  const availableSubjects = getFilteredSubjects(currentDafter);
  const letterTypeOptions = [...new Set(
    Object.values(templatesData)
      .map((t) => t?.letterType)
      .filter(Boolean)
  )];

  const calculatedPrefix = getSenderPrefix(formValues["sender-department"], formValues["sender-jamaat"]);
  const filledSubjects = subjects.filter(
    (s) => s.subject?.trim()
  );

  const updateSubject = (index, field, value) => {
    const updated = [...subjects];
    updated[index][field] = value;

    if (field === "subject") {
      const template = getTemplate(templatesData, value);

      updated[index].letterType = template?.letterType || "";
      updated[index].variables = template
        ? structuredClone(template.variables)
        : {};

      updated[index].content = template?.body ?? template?.content ?? "";
      updated[index].cosmetics = (updated[index].cosmetics && updated[index].cosmetics.greeting)
        ? updated[index].cosmetics
        : getRandomCosmetics();
    }

    setSubjects(updated);
  };

  const updateAttachment = (
    index,
    attachmentIndex,
    field,
    value
  ) => {
    const updated = [...subjects];
    updated[index].attachments[attachmentIndex][field] = value;
    setSubjects(updated);
  };

  const addAttachment = (index) => {
    const updated = [...subjects];
    updated[index].attachments.push(createDefaultAttachment());
    setSubjects(updated);
  };

  const removeAttachment = (
    index,
    attachmentIndex
  ) => {
    const updated = [...subjects];
    updated[index].attachments.splice(attachmentIndex, 1);
    setSubjects(updated);
  };

  const rendercontent = (content, variables = {}) => {
    let output = "";

    if (typeof content === "string") {
      output = content;
    }
    else if (content && typeof content === "object") {
      const generateHTML = (node, previousNode = null, nextNode = null) => {
        if (!node) return "";

        if (node.type === "text" && typeof node.text === "string") {
          let text = node.text;
          if (node.marks) {
            node.marks.forEach(mark => {
              if (mark.type === "bold") text = `<strong>${text}</strong>`;
              if (mark.type === "italic") text = `<em>${text}</em>`;
              if (mark.type === "underline") text = `<u>${text}</u>`;
            });
          }
          return text;
        }

        if (node.type === "hardBreak") {
          return "<br />";
        }

        const childrenHtml = Array.isArray(node.content)
          ? node.content.map(generateHTML).join("")
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
              return `
                <div class="-mt-1 mb-5 text-black text-sm text-center">
                  ${childrenHtml}
                </div>
              `;
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
          case "image": {
            return `
    <div class="my-2 text-center">
      <img
        src="${node.attrs.src}"
        class="block mx-auto max-w-[90%] h-auto"
      />
    </div>
  `;
          }
          default:
            return childrenHtml;
        }
      };

      output = generateHTML(content);
    }

    Object.entries(variables).forEach(([name, variable]) => {
      let val = variable?.value ?? "";
      if (variable?.type === "number") {
        val = toBanglaDigits(val);
      }
      output = output.replaceAll(
        `{{${name}}}`,
        val
      );
    });

    return output;
  };

  const previewLetters = subjects
    .filter(s => s.subject.trim())
    .map(subject => {
      const currentCosmetics = (subject.cosmetics && subject.cosmetics.greeting)
        ? subject.cosmetics
        : getRandomCosmetics();

      return {
        sender: formValues["sender"],
        senderTitle: formValues["sender-title"],
        senderField: formValues["sender-field"],
        senderDepartment: formValues["sender-department"],
        senderJamaat: formValues["sender-jamaat"],
        senderReach: formValues["sender-reach"],

        senderPrefix: calculatedPrefix,
        department:
          formValues.department ||
          currentDafter ||
          "",

        fyStart: toBanglaDigits(subject.fyStart || formValues["fy-start"]),
        fyEnd: toBanglaDigits(subject.fyEnd || formValues["fy-end"]),
        letterNo: toBanglaDigits(subject.letterNo || formValues["letter-no"]),
        date: prettyStoredDate(subject.date || formValues["date"]),

        receiverTitle: formValues["receiver-title"],
        receiverField: formValues["receiver-field"],
        receiverDepartment: formValues["receiver-department"],
        receiverJamaat: formValues["receiver-jamaat"],

        subject: subject.subject,
        letterType: subject.letterType,
        body: rendercontent(subject.content, subject.variables),
        variables: subject.variables,

        onulipi,
        cosmetics: currentCosmetics,

        attachments: (subject.attachments || []).map(att => ({
          annexCode: att.annexCode,
          body: rendercontent(att.content, subject.variables),
        }))
      };
    });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const canPreview = mounted && previewLetters.length > 0 && previewLetters.every(letter =>
    letter.sender &&
    letter.senderTitle &&
    letter.senderDepartment &&
    letter.senderJamaat &&
    letter.receiverTitle &&
    letter.receiverDepartment &&
    letter.receiverJamaat &&
    letter.subject &&
    letter.letterNo &&
    letter.fyStart &&
    letter.fyEnd &&
    letter.date
  );

  const BengaliInput = React.forwardRef((props, ref) => {
    const labelText = props.placeholder || props.placeholderText;
    const inputTitle = labelText ? `${labelText}: ${props.value || ''}` : undefined;
    return (
      <input
        {...props}
        ref={ref}
        value={toBanglaDigits(props.value)}
        title={inputTitle}
        className="w-full cursor-none"
        readOnly
      />
    );
  });

  const normalizeLetterNo = (value) => {
    value = fromBanglaDigits(value);
    value = value.replace(/\D/g, "");

    return value === ""
      ? ""
      : toBanglaDigits(value);
  };

  const finalizeLetterNo = (value) => {
    value = fromBanglaDigits(value);
    value = value.replace(/\D/g, "");

    return value === ""
      ? ""
      : toBanglaDigits(value.padStart(2, "0"));
  };

  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);

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

  const printRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Letter",
  });

  const letterRef = useRef(null);
  const letterRefs = useRef([]);
  const dialogRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);

  const openFullscreen = async () => {
    const png = await toPng(letterRef.current, {
      pixelRatio: window.devicePixelRatio * 2
    });

    setPreviewImage(png);
    dialogRef.current.showModal();
  };
  const closeFullscreen = () => {
    dialogRef.current.close();
  };

  /*
   * Renders each element in `elements` onto its own PDF page — a letter's
   * boilerplate page and every attachment page stay on separate pages
   * instead of being flattened into one tall image and shrunk to fit.
   */
  const elementsToPdfBase64 = (elements) => buildPdfFromElements(elements);

  const getLetterPages = (index) => {
    const ref = letterRefs.current[index];
    if (!ref) return [];
    return [ref.main, ...(ref.attachments || [])];
  };

  const generatePdfBase64 = () => {
    const allPages = previewLetters.flatMap((_, index) => getLetterPages(index));
    return elementsToPdfBase64(allPages);
  };

  const handleSave = async () => {
    const formattedSubjects = subjects.map((subject) => ({
      ...structuredClone(subject),
      cosmetics:
        subject.cosmetics && subject.cosmetics.greeting
          ? structuredClone(subject.cosmetics)
          : getRandomCosmetics(),
    }));

    /*
     * `department`, `boilerplate`, `letterType`, and `subject` are stray
     * top-level scalars that don't belong in the saved document: `department`
     * duplicates the Dafter value (now saved once, as `dafter`), and the rest
     * are per-subject fields that only make sense inside `subjects[i]`.
     */
    const {
      department: _department,
      boilerplate: _boilerplate,
      letterType: _letterType,
      subject: _subject,
      "letter-no": _letterNo,
      "fy-start": _fyStart,
      "fy-end": _fyEnd,
      date: _date,
      ...restFormValues
    } = structuredClone(formValues);

    const baseFormValues = {
      ...restFormValues,
      onulipi: structuredClone(onulipi),
      /*
       * The Dafter field is edited as `formValues.department` (see the
       * HybridInput below), but saved under a single `dafter` key.
       */
      dafter:
        formValues.department ??
        currentDafter ??
        "",
      /*
       * `sender-department` remains the actual organization.
       */
      "sender-department":
        formValues["sender-department"] ?? "",
    };

    /*
     * Each subject added via the "+" button in the info tab is a distinct
     * letter (its own letter-no, fiscal year, and date), so it's saved as
     * its own `.letter` file rather than bundled together in one document.
     * Subject index 0 falls back to the shared top-level fields; later
     * subjects carry their own overrides entered in the UI.
     */
    const savedPaths = [];
    for (const subject of formattedSubjects) {
      const savedFormValues = {
        ...baseFormValues,
        subjects: [subject],
        "letter-no": subject.letterNo || formValues["letter-no"] || "",
        "fy-start": subject.fyStart || formValues["fy-start"] || "",
        "fy-end": subject.fyEnd || formValues["fy-end"] || "",
        date: subject.date || formValues["date"] || "",
      };

      savedPaths.push(
        await invoke("save_letter", { formValues: savedFormValues })
      );
    }

    return savedPaths;
  };

  const handleDiscard = () => {
    const emptyValues = {};
    setFormValues(emptyValues);
    setOnulipi([
      {
        holder: "অফিস কপি",
        reach: "",
        department: "",
        jamaat: ""
      }
    ]);
    setSubjects([createDefaultSubject()]);
    setHistory([emptyValues]);
    setIndex(0);
  };

  const handlePrintAndSave = async () => {
    try {
      const pdfBase64 = await generatePdfBase64();

      await Promise.all([
        handleSave(),
        printPdfSilent(pdfBase64)
      ]);

      alert("Printed successfully!");
    } catch (err) {
      console.error("Print/Save failed:", err);
      alert("Printing failed: " + err);
    }
  };

  const handleSaveToPdf = async () => {
    try {
      const savedPaths = [];
      const rawSubjects = subjects.filter(s => s.subject.trim());

      for (let index = 0; index < previewLetters.length; index++) {
        const pages = getLetterPages(index);
        if (!pages.length) continue;

        const pdfBase64 = await elementsToPdfBase64(pages);
        const rawSubject = rawSubjects[index] || {};

        const document = {
          "letter-no": rawSubject.letterNo || formValues["letter-no"] || "",
          date: rawSubject.date || formValues["date"] || "",
          subjects: [{ subject: rawSubject.subject || "Letter" }],
        };

        savedPaths.push(
          await invoke("save_pdf_to_temp", { pdfBase64, kind: "letter", document })
        );
      }

      alert(`${savedPaths.length}টি PDF সংরক্ষিত হয়েছে:\n` + savedPaths.join("\n"));
    } catch (err) {
      console.error("Save to PDF failed:", err);
      alert("Saving PDF failed: " + err);
    }
  };

  const getEmailFromHierarchy = (reach, jamaat, department) => {
    const r = reach?.trim();
    const j = jamaat?.trim();
    const d = department?.trim();

    return jamaatData?.[r]?.[j]?.[d]?.email || "";
  };

  const getReceiverEmail = () => {
    return getEmailFromHierarchy(
      formValues["receiver-reach"],
      formValues["receiver-jamaat"],
      formValues["receiver-department"]
    );
  };

  const getSenderEmail = () => {
    return getEmailFromHierarchy(
      formValues["sender-reach"],
      formValues["sender-jamaat"],
      formValues["sender-department"]
    );
  };

  const [appPassword, setAppPassword] = useState(
    () => localStorage.getItem("smtp_app_password") || ""
  );

  const getOrPromptAppPassword = () => {
    let password = appPassword;

    if (!password) {
      password = window.prompt("ইমেইল পাঠানোর জন্য App Password টি লিখুন:");
      if (password) {
        password = password.trim();
        localStorage.setItem("smtp_app_password", password);
        setAppPassword(password);
      }
    }

    return password;
  };

  const handleSend = async () => {
    let savedFilePath = null;
    try {
      savedFilePath = await handleSave();
    } catch (saveErr) {
      console.error("Save operation failed:", saveErr);
      alert("Could not save document version: " + saveErr);
      return;
    }

    try {
      const currentPlatform = await type();
      if (currentPlatform !== 'android') {
        const pdfBase64 = await generatePdfBase64();
        await printPdfSilent(pdfBase64);
      }
    } catch (printErr) {
      console.warn("Print execution bypassed or failed:", printErr);
    }

    const password = getOrPromptAppPassword();
    if (!password) {
      alert("Email dispatch canceled. Document changes remain saved.");
      return;
    }

    try {
      const pdfBase64 = await generatePdfBase64();
      await invoke("send_email_with_pdf", {
        fromEmail: getSenderEmail(),
        toEmail: getReceiverEmail(),
        appPassword: password,
        subject: subjects[0]?.subject || "Letter Document",
        pdfBase64,
      });
      alert("Email sent successfully!");
    } catch (emailErr) {
      console.error("Email dispatch failed:", emailErr);
      alert("Authentication or dispatch failed. Document remains saved successfully.");
    }
  };

  useEffect(() => {
    const fetchNextLetterNo = async () => {
      const org = formValues["sender-department"] || "";
      const dept = formValues.department || currentDafter;

      if (!org || !dept) return;

      const fy = calculateFiscalYear(formValues["date"], org);
      const fyStr = `${fromBanglaDigits(fy.start)}-${fromBanglaDigits(fy.end)}`;

      try {
        const nextNo = await invoke("get_next_letter_no", { org, dept, fyStr });
        const banglaNextNo = toBanglaDigits(nextNo);

        setFormValues((prev) => ({
          ...prev,
          "letter-no": banglaNextNo
        }));
      } catch (err) {
        console.error("Failed to retrieve next letter number:", err);
      }
    };

    fetchNextLetterNo();
  }, [
    formValues["sender-department"],
    formValues["sender-reach"],
    formValues["sender-jamaat"],
    formValues["date"],
    formValues.department,
    currentDafter
  ]);

  return (
    <form ref={formRef}>
      <div className='separator'>প্রাপক</div>
      <HybridInput
        name="receiver-reach"
        data-default="কেন্দ্রীয়"
        placeholderInitial="প্রাপকের ধরণ"
        defaultValue="কেন্দ্রীয়"
        optionsFetcher={() => getOptions("reach")}
        onChange={internalHandleInput}
        value={formValues["receiver-reach"] || ""}
        className="w-full font-bengali"
      />
      <div className="gap-x-2 grid grid-cols-[1fr_1fr_2fr] w-full">
        <HybridInput
          name="receiver-title"
          data-default="সদর"
          placeholderInitial="পদবী"
          defaultValue="সদর"
          optionsFetcher={() => getOptions("title", {
            reach: formValues["receiver-reach"],
            jamaat: formValues["receiver-jamaat"],
            department: formValues["receiver-department"]
          })}
          value={formValues["receiver-title"] || ""}
          onChange={internalHandleInput}
        />
        <HybridInput
          name="receiver-field"
          data-default="নেই"
          placeholderInitial="দপ্তর ক্ষেত্র"
          defaultValue="নেই"
          optionsFetcher={async () => {
            const opts = await getOptions("field", {
              reach: formValues["receiver-reach"],
              jamaat: formValues["receiver-jamaat"],
              department: formValues["receiver-department"]
            });
            return ["নেই", ...opts.filter((o) => o !== "নেই")];
          }}
          value={formValues["receiver-field"] || "নেই"}
          onChange={internalHandleInput}
        />
        <HybridInput
          name="receiver"
          data-default="মোস্তাক আহমদ"
          placeholderInitial="নাম"
          defaultValue="মোস্তাক আহমদ"
          optionsFetcher={() => getOptions("name", {
            reach: formValues["receiver-reach"],
            jamaat: formValues["receiver-jamaat"],
            department: formValues["receiver-department"],
            title: formValues["receiver-title"]
          })}
          value={formValues.receiver || ""}
          onChange={internalHandleInput}
        />
      </div>
      <div className="gap-x-2 grid grid-cols-2 w-full">
        <HybridInput
          name="receiver-department"
          data-default="মজলিস খোদ্দামুল আহমদীয়া"
          placeholderInitial="সংগঠন"
          defaultValue="মজলিস খোদ্দামুল আহমদীয়া"
          optionsFetcher={() => getOptions("department", {
            reach: formValues["sender-reach"],
            jamaat: formValues["sender-jamaat"]
          })}
          value={formValues["receiver-department"] || ""}
          onChange={internalHandleInput}
        />
        <HybridInput
          name="receiver-jamaat"
          data-default="বাংলাদেশ"
          placeholderInitial="জামা'ত"
          defaultValue="বাংলাদেশ"
          optionsFetcher={() => getOptions("jamaat", {
            reach: formValues["receiver-reach"]
          })}
          value={formValues["receiver-jamaat"] || ""}
          onChange={internalHandleInput}
        />
      </div>
      <div className='separator'>প্রেরক</div>
      <HybridInput
        name="sender-reach"
        data-default="স্থানীয়"
        placeholderInitial="প্রেরকের ধরণ"
        defaultValue="স্থানীয়"
        optionsFetcher={() => getOptions("reach")}
        onChange={internalHandleInput}
        value={formValues["sender-reach"] || ""}
        className="p-0 w-full font-bengali"
      />
      <div className="gap-x-2 grid grid-cols-2 w-full">
        <HybridInput
          name="sender-department"
          data-default="মজলিস খোদ্দামুল আহমদীয়া"
          placeholderInitial="সংগঠন"
          defaultValue="মজলিস খোদ্দামুল আহমদীয়া"
          optionsFetcher={() => getOptions("department", {
            reach: formValues["sender-reach"],
            jamaat: formValues["sender-jamaat"]
          })}
          value={formValues["sender-department"] || ""}
          onChange={internalHandleInput}
        />
        <HybridInput
          name="sender-jamaat"
          data-default="বাংলাদেশ"
          placeholderInitial="জামা'ত"
          defaultValue="বাংলাদেশ"
          optionsFetcher={() => getOptions("jamaat", {
            reach: formValues["sender-reach"]
          })}
          value={formValues["sender-jamaat"] || ""}
          onChange={internalHandleInput}
        />
      </div>
      <div className="gap-x-2 grid grid-cols-[1fr_1fr_2fr] w-full">
        <HybridInput
          name="sender-title"
          data-default="পদবী"
          placeholderInitial="পদবী"
          defaultValue="সহকারী তবলীগ"
          optionsFetcher={() => getOptions("title", {
            reach: formValues["sender-reach"],
            jamaat: formValues["sender-jamaat"],
            department: formValues["sender-department"]
          })}
          value={formValues["sender-title"] || ""}
          onChange={internalHandleInput}
        />
        <HybridInput
          name="sender-field"
          data-default="নেই"
          placeholderInitial="দপ্তর ক্ষেত্র"
          defaultValue="নেই"
          optionsFetcher={async () => {
            const opts = await getOptions("field", {
              reach: formValues["sender-reach"],
              jamaat: formValues["sender-jamaat"],
              department: formValues["sender-department"]
            });
            return ["নেই", ...opts.filter((o) => o !== "নেই")];
          }}
          value={formValues["sender-field"] || "নেই"}
          onChange={internalHandleInput}
        />
        <HybridInput
          name="sender"
          data-default="শাহ নাদিম আহমদ"
          placeholderInitial="নাম"
          defaultValue="নাম"
          optionsFetcher={() => getOptions("name", {
            reach: formValues["sender-reach"],
            jamaat: formValues["sender-jamaat"],
            department: formValues["sender-department"],
            title: formValues["sender-title"]
          })}
          value={formValues["sender"] || ""}
          onChange={internalHandleInput}
        />
      </div>
      <div className='separator'>অনুলিপি</div>
      {onulipi.map((entry, index) => (
        <div key={index} className="">
          <div className='gap-x-2 grid grid-cols-[0.2fr_1fr]'>
            <HybridInput
              name={`onulipi-reach-${index}`}
              data-default="কেন্দ্রীয়"
              placeholderInitial="অনুলিপির ধরণ"
              defaultValue="কেন্দ্রীয়"
              value={entry.reach || ""}
              readOnly={index === 0}
              optionsFetcher={() => getOptions("reach")}
              onChange={(e) => updateOnulipi(index, 'reach', e.target.value)}
            />
            <HybridInput
              data-default="অনুলিপি প্রাপক"
              optionsFetcher={["রিজিওনাল কায়েদ"]}
              placeholderInitial="অনুলিপি প্রাপক"
              defaultValue="অনুলিপি প্রাপক"
              value={entry.holder}
              readOnly={index === 0}
              onChange={(e) => updateOnulipi(index, 'holder', e.target.value)}
            />
          </div>
          <div className='gap-x-2 grid grid-cols-2'>
            <HybridInput
              name={`onulipi-dept-${index}`}
              data-default="মজলিস খোদ্দামুল আহমদীয়া"
              placeholderInitial="সংগঠন"
              defaultValue="মজলিস খোদ্দামুল আহমদীয়া"
              value={entry.department || ""}
              readOnly={index === 0}
              optionsFetcher={() => getOptions("department", {
                reach: entry.reach,
                jamaat: entry.jamaat
              })}
              onChange={(e) => updateOnulipi(index, 'department', e.target.value)}
            />
            <HybridInput
              name={`onulipi-jamaat-${index}`}
              data-default="নারায়ণগঞ্জ"
              placeholderInitial="জামা'ত"
              defaultValue="নারায়ণগঞ্জ"
              value={entry.jamaat || ""}
              readOnly={index === 0}
              optionsFetcher={() => getOptions("jamaat", {
                reach: entry.reach
              })}
              onChange={(e) => updateOnulipi(index, 'jamaat', e.target.value)}
            />
          </div>
          {index === onulipi.length - 1 && (
            <button type="button" title="নতুন অনুলিপি যোগ করুন" onClick={() => setOnulipi([...onulipi, { holder: "", department: "", jamaat: "", reach: "" }])} className="w-full"><Plus /></button>
          )}
        </div>
      ))}
      <div className='separator'>তথ্য</div>
      <div className="gap-x-2 grid grid-cols-[1fr_1.5fr_1fr_0.5fr_2fr] w-full">
        {renderStandardInput("sender-prefix", "সংক্ষিপ্ত রূপ", calculatedPrefix, undefined, { readOnly: true, className: "w-full font-bengali" })}
        <div className="flex flex-row gap-x-1 w-full">
          {renderStandardInput("fy-start", "অ. শুরু", formValues["fy-start"] || "", undefined, { readOnly: true, className: "w-full" })}
          {renderStandardInput("fy-end", "অ. শেষ", formValues["fy-end"] || "", undefined, { readOnly: true, className: "w-full" })}
        </div>
        <HybridInput
          name="department"
          optionsFetcher={() => getOptions("dafter")}
          placeholderInitial="দপ্তরের নাম"
          defaultValue="দপ্তর"
          value={formValues.department ?? currentDafter}
          onChange={(e) => setFormValues(prev => ({ ...prev, department: e.target.value }))}
          className="w-full"
        />
        {renderStandardInput(
          "letter-no",
          "চিঠি নং",
          formValues["letter-no"] || "",
          (e) =>
            internalHandleInput({
              target: {
                name: "letter-no",
                value: normalizeLetterNo(e.target.value)
              }
            }),
          {
            className: 'w-full',
            onBlur: (e) =>
              internalHandleInput({
                target: {
                  name: "letter-no",
                  value: finalizeLetterNo(e.target.value)
                }
              })
          }
        )}
        <div className="flex flex-col w-full min-w-0">
          <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">তারিখ</label>
          <DatePicker
            selected={parseStoredDate(formValues["date"])}
            customInput={<BengaliInput placeholder="তারিখ" />}
            onChange={(date) => {
              if (!date) return;

              internalHandleInput({
                target: {
                  name: "date",
                  value: storeDate(date)
                }
              });
            }}
            locale="bn"
            dateFormat={displayDate}
            placeholderText="তারিখ"
            className="w-full cursor-none"
          />
        </div>
      </div>
      <div className="w-full">
        {subjects.map((entry, index) => (
          <div key={index} className="mb-4">
            {index > 0 && (
              <div className="gap-2 grid grid-cols-[1fr_1fr_1fr_2fr] mt-2">
                {renderStandardInput("subject-fyStart", "অর্থবছর শুরু", toBanglaDigits(entry.fyStart || ""), undefined, { readOnly: true })}
                {renderStandardInput("subject-fyEnd", "অর্থবছর শেষ", toBanglaDigits(entry.fyEnd || ""), undefined, { readOnly: true })}
                {renderStandardInput(
                  `subject-letterNo-${index}`,
                  "চিঠি নং",
                  entry.letterNo || "",
                  (e) => {
                    const updated = [...subjects];
                    updated[index].letterNo = normalizeLetterNo(e.target.value);
                    setSubjects(updated);
                  },
                  {
                    className: "w-full",
                    onBlur: (e) => {
                      const updated = [...subjects];
                      updated[index].letterNo = finalizeLetterNo(e.target.value);
                      setSubjects(updated);
                    }
                  }
                )}
                <div className="flex flex-col w-full min-w-0">
                  <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">তারিখ</label>
                  <DatePicker
                    selected={parseStoredDate(entry.date)}
                    customInput={<BengaliInput placeholder="তারিখ" />}
                    onChange={(date) => {
                      if (!date) return;

                      const updated = [...subjects];
                      updated[index].date = storeDate(date);

                      setSubjects(updated);
                    }}
                    locale="bn"
                    dateFormat="dd MMMM, yyyy"
                    placeholderText="তারিখ"
                    className="w-full cursor-none"
                  />
                </div>
              </div>
            )}
            <div className="items-center gap-2 grid grid-cols-[1fr_2fr_auto]">
              <HybridInput
                name={`letterType-${index}`}
                autoComplete="off"
                placeholderInitial="ধরন"
                defaultValue="ধরন"
                optionsFetcher={letterTypeOptions}
                value={entry.letterType || ""}
                onChange={(e) => updateSubject(index, "letterType", e.target.value)}
                className="w-full font-bengali"
              />
              <HybridInput
                name={`subject-${index}`}
                autoComplete="off"
                placeholderInitial="বিষয়"
                defaultValue="বিষয়"
                optionsFetcher={availableSubjects}
                value={entry.subject}
                onChange={(e) => updateSubject(index, "subject", e.target.value)}
                className="w-full font-bengali"
              />
              {subjects.length > 1 && (
                <button
                  type="button"
                  title="বিষয় মুছুন"
                  onClick={() =>
                    setSubjects(subjects.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 />
                </button>
              )}
            </div>

            {index === subjects.length - 1 && (
              <button
                type="button"
                className="w-full"
                title="নতুন বিষয় যোগ করুন"
                onClick={() =>
                  setSubjects([
                    ...subjects,
                    {
                      ...createDefaultSubject(),
                      ...(subjects.length > 0 && {
                        letterNo: toBanglaDigits(
                          String(
                            Number(
                              fromBanglaDigits(
                                subjects[subjects.length - 1].letterNo ||
                                formValues["letter-no"] ||
                                "0"
                              )
                            ) + 1
                          ).padStart(2, "0")
                        ),
                        fyStart:
                          subjects[subjects.length - 1].fyStart ||
                          formValues["fy-start"] ||
                          "",
                        fyEnd:
                          subjects[subjects.length - 1].fyEnd ||
                          formValues["fy-end"] ||
                          "",
                        date:
                          subjects[subjects.length - 1].date ||
                          formValues["date"] ||
                          ""
                      })
                    }
                  ])
                }
              >
                <Plus />
              </button>
            )}
          </div>
        ))}
      </div>
      {filledSubjects.length > 0 && (
        <div>
          <div className="separator">বিস্তারিত</div>

          {filledSubjects.map((entry, index) => {
            const variables = Object.entries(entry.variables || {});
            const chunkSize = 3;
            const variableRows = [];
            for (let i = 0; i < variables.length; i += chunkSize) {
              variableRows.push(variables.slice(i, i + chunkSize));
            }

            const renderVariableInput = (name, variable) => {
              const varType = typeof variable === "object" && variable !== null
                ? variable.type
                : variable;

              const varValue = typeof variable === "object" && variable !== null
                ? (variable.value || "")
                : "";

              const setVarVal = (val) => {
                const updated = [...subjects];
                if (typeof updated[index].variables[name] === "object" && updated[index].variables[name] !== null) {
                  updated[index].variables[name].value = val;
                } else {
                  updated[index].variables[name] = {
                    type: updated[index].variables[name],
                    value: val
                  };
                }
                setSubjects(updated);
              };

              switch (varType) {
                case "number":
                case "phone":
                  return renderStandardInput(
                    name,
                    name,
                    toBanglaDigits(varValue),
                    (e) => setVarVal(normalizeNumericVariable(e.target.value)),
                    { className: "w-full font-bengali" }
                  );

                case "currency":
                case "money":
                  return (
                    <div className="flex flex-col w-full min-w-0">
                      <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">{name}</label>
                      <div className="relative flex items-center w-full">
                        <input
                          placeholder={name}
                          value={toBanglaDigits(varValue)}
                          title={`${name}: ${varValue}`}
                          onChange={(e) => setVarVal(normalizeNumericVariable(e.target.value))}
                          className="pr-12 w-full font-bengali"
                        />
                        <span className="right-2 absolute font-bengali text-gray-500 text-sm pointer-events-none">
                          ৳
                        </span>
                      </div>
                    </div>
                  );

                case "dafter":
                  return (
                    <HybridInput
                      optionsFetcher={() => getOptions("dafter")}
                      placeholderInitial={name}
                      defaultValue={name}
                      value={varValue}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );

                case "reach":
                  return (
                    <HybridInput
                      optionsFetcher={() => getOptions("reach")}
                      placeholderInitial={name}
                      defaultValue={name}
                      value={varValue}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );

                case "jamaat":
                  return (
                    <HybridInput
                      optionsFetcher={() => getOptions("jamaat", {
                        reach: formValues["sender-reach"]
                      })}
                      placeholderInitial={name}
                      defaultValue={name}
                      value={varValue}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );

                case "organization":
                case "department":
                  return (
                    <HybridInput
                      optionsFetcher={() => getOptions("department", {
                        reach: formValues["sender-reach"],
                        jamaat: formValues["sender-jamaat"]
                      })}
                      placeholderInitial={name}
                      defaultValue={name}
                      value={varValue}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );

                case "designation":
                case "title":
                  return (
                    <HybridInput
                      optionsFetcher={() => getOptions("title", {
                        reach: formValues["sender-reach"],
                        jamaat: formValues["sender-jamaat"],
                        department: formValues["sender-department"]
                      })}
                      placeholderInitial={name}
                      defaultValue={name}
                      value={varValue}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );

                case "field":
                  return (
                    <HybridInput
                      optionsFetcher={async () => {
                        const opts = await getOptions("field", {
                          reach: formValues["sender-reach"],
                          jamaat: formValues["sender-jamaat"],
                          department: formValues["sender-department"]
                        });
                        return ["নেই", ...opts.filter((o) => o !== "নেই")];
                      }}
                      placeholderInitial={name}
                      defaultValue="নেই"
                      value={varValue || "নেই"}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );

                case "name":
                  return (
                    <HybridInput
                      optionsFetcher={() => getOptions("name", {
                        reach: formValues["sender-reach"],
                        jamaat: formValues["sender-jamaat"],
                        department: formValues["sender-department"],
                        title: formValues["sender-title"]
                      })}
                      placeholderInitial={name}
                      defaultValue={name}
                      value={varValue}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );

                case "month":
                  return (
                    <HybridInput
                      optionsFetcher={BENGALI_MONTHS}
                      placeholderInitial={name}
                      defaultValue={name}
                      value={varValue}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );

                case "date":
                  return (
                    <div className="flex flex-col w-full min-w-0">
                      <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">{name}</label>
                      <div className="w-full">
                        <DatePicker
                          customInput={<BengaliInput placeholder={name} className="w-full" />}
                          selected={parseStoredDate(varValue)}
                          onChange={(date) => {
                            if (!date) return;
                            setVarVal(storeDate(date));
                          }}
                          locale="bn"
                          dateFormat="dd MMMM, yyyy"
                          placeholderText={name}
                          wrapperClassName="w-full"
                          className="w-full cursor-none"
                        />
                      </div>
                    </div>
                  );

                case "time":
                  return renderStandardInput(
                    name,
                    name,
                    varValue,
                    (e) => setVarVal(e.target.value),
                    { type: "time", className: "w-full font-bengali" }
                  );

                case "day":
                case "weekday":
                  return (
                    <HybridInput
                      optionsFetcher={[
                        "রবিবার",
                        "সোমবার",
                        "মঙ্গলবার",
                        "বুধবার",
                        "বৃহস্পতিবার",
                        "শুক্রবার",
                        "শনিবার"
                      ]}
                      placeholderInitial={name}
                      defaultValue={name}
                      value={varValue}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );

                case "email":
                  return renderStandardInput(
                    name,
                    name,
                    varValue,
                    (e) => setVarVal(e.target.value),
                    { type: "email", className: "w-full" }
                  );

                default:
                  return (
                    <HybridInput
                      optionsFetcher={[]}
                      type={varType}
                      placeholderInitial={name}
                      defaultValue={name}
                      value={varValue}
                      onChange={(e) => setVarVal(e.target.value)}
                    />
                  );
              }
            };

            return (
              <div key={index} className="mb-6">
                <div className="mb-2 font-bengali font-bold">
                  {entry.subject}
                </div>

                {variableRows.map((rowVars, rowIndex) => {
                  const count = rowVars.length;
                  const gridColsClass =
                    count === 1
                      ? "grid-cols-1"
                      : count === 2
                        ? "grid-cols-2"
                        : "grid-cols-3";

                  return (
                    <div key={rowIndex} className={`grid ${gridColsClass} gap-2 mb-2`}>
                      {rowVars.map(([name, variable]) => (
                        <div key={name} className="w-full">
                          {renderVariableInput(name, variable)}
                        </div>
                      ))}
                    </div>
                  );
                })}

                <TextEditor
                  value={entry.content}
                  placeholder="মূল লেখা..."
                  onChange={(json) => {
                    const updated = [...subjects];
                    updated[index].content = json;
                    setSubjects(updated);
                  }}
                />

                {(entry.attachments ?? []).map((attachment, attachmentIndex) => (
                  <div
                    key={attachmentIndex}
                    className="mb-4 border-b"
                  >
                    {renderStandardInput(
                      `annexCode-${index}-${attachmentIndex}`,
                      "সংযুক্তি কোড",
                      attachment.annexCode,
                      (e) =>
                        updateAttachment(
                          index,
                          attachmentIndex,
                          "annexCode",
                          e.target.value
                        ),
                      { className: "w-full" }
                    )}
                    <TextEditor
                      value={attachment.content}
                      placeholder="সংযুক্তি..."
                      onRemoveAttachment={() => removeAttachment(index, attachmentIndex)}
                      onChange={(content) => {
                        const updated = [...subjects];
                        updated[index].attachments[attachmentIndex].content = content;
                        setSubjects(updated);
                      }}
                    />
                  </div>
                ))}

                <button
                  type="button"
                  className="w-full"
                  title="সংযুক্তি যোগ করুন"
                  onClick={() => addAttachment(index)}
                >
                  <Plus />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {canPreview && (
        <div ref={(el) => {
          printRef.current = el;
          containerRef.current = el;
          letterRef.current = el;
        }}
          className='print-area'>
          {previewLetters.map((letter, index) => (
            <div key={index}>
              <div className={index > 0 ? "page-break mt-10" : ""}>
                <Boilerplate
                  formValues={letter}
                  previewScale={scale}
                  pageRef={(el) => {
                    letterRefs.current[index] = letterRefs.current[index] || {};
                    letterRefs.current[index].main = el;
                  }}
                />
              </div>

              {(letter.attachments || []).map((att, attIdx) => (
                <div key={`att-${attIdx}`} className="mt-10 page-break">
                  <Boilerplate
                    formValues={letter}
                    isAttachment={true}
                    attachmentData={att}
                    previewScale={scale}
                    pageRef={(el) => {
                      letterRefs.current[index] = letterRefs.current[index] || {};
                      letterRefs.current[index].attachments = letterRefs.current[index].attachments || [];
                      letterRefs.current[index].attachments[attIdx] = el;
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <dialog ref={dialogRef}>
        <img src={previewImage} onClick={closeFullscreen} alt="Preview" />
      </dialog>
      <div className="absolute flex justify-end gap-0.5 mt-4">
        <button type="button" title="বাতিল করুন" onClick={handleDiscard}>
          <Trash2 />
        </button>
        <button type="button" title="পিডিএফ হিসেবে সংরক্ষণ করুন" onClick={handleSaveToPdf}>
          <FileText />
        </button>
        <button type="button" title="সংরক্ষণ করুন" onClick={handleSave}>
          <Save />
        </button>
        <button type="button" title="প্রিন্ট ও সংরক্ষণ করুন" onClick={handlePrintAndSave}>
          <Printer />
        </button>
        <button type="button" title="ইমেইল পাঠাতেন" onClick={handleSend}>
          <Send />
        </button>
      </div>
    </form>
  );
}