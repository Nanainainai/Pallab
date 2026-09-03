// Replace the entire contents of your TemplateMaker component file with this code.

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ArrowLeft, Save, Edit3, Tag } from "lucide-react";
import HybridInput, { renderStandardInput } from "./hybrid-input";
import TextEditor from "./text-editor";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { documentDir, join } from "@tauri-apps/api/path";
import { loadJsonDataFile } from "../lib/letterUtils";

const DAFTER_ORDER = [
  "সদর",
  "তাজনীদ",
  "এতেমাদ",
  "তরবিয়ত",
  "নও মোবাঈন",
  "রিশতানাতা",
  "তাবলীগ",
  "তালীম",
  "ওয়াকারে আমল",
  "মাল",
  "তাহরিকে জাদীদ",
  "ওয়াকফে জাদীদ",
  "সানাত এ তেজারাত",
  "উমুরে তোলাবা",
  "খেদমতে খালক",
  "সেহতে জিসমানী",
  "ইশায়াত",
  "আতফাল",
  "উমুমী",
  "ওয়াকফে নও",
  "মোহাসেব"
];

const LETTER_TYPES = ["রিপোর্ট", "সার্কুলার"];

const TYPE_MAPPING = {
  "টেক্সট": "text",
  "সংখ্যা": "number",
  "টাকা": "currency",
  "তারিখ": "date",
  "মাস": "month",
  "সময়": "time",
  "বার": "weekday",
  "পর্যায়": "phase",
  "জামা'ত": "jamaat",
  "সংগঠন": "organization",
  "দপ্তর": "dafter",
  "পদবী": "designation",
  "নাম": "name",
  "ইমেইল": "email"
};

const REVERSE_TYPE_MAPPING = Object.fromEntries(
  Object.entries(TYPE_MAPPING).map(([label, value]) => [value, label])
);

const VARIABLE_TYPES = Object.keys(TYPE_MAPPING);

const sortDaftersByHierarchy = (list) => {
  return [...new Set(list.filter(Boolean))].sort((a, b) => {
    const indexA = DAFTER_ORDER.indexOf(a);
    const indexB = DAFTER_ORDER.indexOf(b);

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    return String(a).localeCompare(String(b), "bn");
  });
};

const uniqueValues = (values) => [
  ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))
];

const extractDaftersFromAmela = (data) => {
  if (!data || typeof data !== "object") return [];

  const result = new Set();

  const traverse = (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;

    Object.entries(node).forEach(([key, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;

      const hasOfficerChild = Object.values(value).some(
        (child) =>
          child &&
          typeof child === "object" &&
          !Array.isArray(child) &&
          ("email" in child || "name" in child)
      );

      if (hasOfficerChild) {
        result.add(key);
      } else {
        traverse(value);
      }
    });
  };

  traverse(data);

  return sortDaftersByHierarchy([...result]);
};

const extractReachFromJamaat = (data) => {
  if (!data || typeof data !== "object") return [];
  return Object.keys(data);
};

const extractOrganizationsFromJamaat = (data) => {
  if (!data || typeof data !== "object") return [];

  const organizations = new Set();

  const traverse = (node, depth = 0) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;

    Object.entries(node).forEach(([key, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;

      /*
       * jamaat.json follows:
       *
       * reach
       *   -> jamaat
       *      -> organization
       *         -> contact information
       *
       * The organization is therefore normally the third object level.
       */
      if (depth === 2) {
        organizations.add(key);
        return;
      }

      traverse(value, depth + 1);
    });
  };

  traverse(data);

  return [...organizations];
};

const parseArray = (value) => {
  if (Array.isArray(value)) {
    return uniqueValues(value);
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  return [value];
};

const parseInitialTemplates = (data) => {
  if (Array.isArray(data)) {
    return data.map(normalizeTemplate);
  }

  if (!data || typeof data !== "object") return [];

  const list = [];

  Object.entries(data).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;

    if (
      "dafter" in value ||
      "reach" in value ||
      "organization" in value ||
      "content" in value ||
      "body" in value
    ) {
      list.push(
        normalizeTemplate({
          ...value,
          id: value.id ?? key,
          title: value.title ?? key
        })
      );

      return;
    }

    Object.entries(value).forEach(([title, details]) => {
      if (!details || typeof details !== "object") return;

      list.push(
        normalizeTemplate({
          ...details,
          id: details.id ?? `${key}-${title}`,
          title,
          dafter:
            details.dafter ??
            key
        })
      );
    });
  });

  return list;
};

const normalizeTemplate = (template) => ({
  ...template,
  id: template.id,
  title: template.title || "",
  letterType: template.letterType || "",
  reach: parseArray(template.reach),
  organization: parseArray(template.organization),
  dafter: sortDaftersByHierarchy(parseArray(template.dafter)),
  variables: template.variables || {},
  body: template.body ?? template.content ?? ""
});

const getDataFilePath = async (fileName) => {
  const docPath = await documentDir();
  return await join(docPath, "Pallab", "data", fileName);
};

const SelectionList = ({
  label,
  values,
  options,
  onAdd,
  onUpdate,
  onRemove,
  placeholder,
  addTitle
}) => {
  const safeValues = Array.isArray(values) ? values : [];

  return (
    <div className="space-y-2">
      {safeValues.map((value, index) => {
        const isLast = index === safeValues.length - 1;

        return (
          <div
            key={`${placeholder}-${index}`}
            className="flex items-end gap-1.5 w-full"
          >
            <HybridInput
              label={label}
              name={`${placeholder}-${index}`}
              placeholderInitial={placeholder}
              defaultValue={options[0] || ""}
              options={options}
              value={value}
              title={`${placeholder}: ${value || ""}`}
              onChange={(event) => onUpdate(index, event.target.value)}
              className="w-full font-bengali"
            />

            <div className="flex items-center gap-0.5 pb-0.5 shrink-0">
              <button
                type="button"
                title={`${label} মুছুন`}
                onClick={() => onRemove(index)}
                className="flex justify-center items-center"
              >
                <Trash2 />
              </button>

              {isLast && (
                <button
                  type="button"
                  title={addTitle}
                  onClick={onAdd}
                  className="flex justify-center items-center"
                >
                  <Plus />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {safeValues.length === 0 && (
        <button
          type="button"
          title={addTitle}
          onClick={onAdd}
          className="flex justify-center items-center w-full"
        >
          <Plus />
        </button>
      )}
    </div>
  );
};

export default function TemplateMaker({
  initialTemplates,
  DAFTERS,
  onSaveTemplate
}) {
  const [templates, setTemplates] = useState(
    (initialTemplates || []).map(normalizeTemplate)
  );

  const [availableReaches, setAvailableReaches] = useState([]);
  const [availableOrganizations, setAvailableOrganizations] = useState([]);
  const [availableDafters, setAvailableDafters] = useState(
    DAFTERS || []
  );

  const [selectedReachFilter, setSelectedReachFilter] =
    useState("সমস্ত");

  const [selectedOrganizationFilter, setSelectedOrganizationFilter] =
    useState("সমস্ত");

  const [selectedDafterFilter, setSelectedDafterFilter] =
    useState("সমস্ত");

  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    const loadDynamicData = async () => {
      try {
        const [jamaatJson, amelaJson, templatesRaw] =
          await Promise.all([
            loadJsonDataFile("jamaat.json", {}),
            loadJsonDataFile("amela.json", {}),
            loadJsonDataFile("templates.json", null)
          ]);

        setAvailableReaches(
          extractReachFromJamaat(jamaatJson)
        );

        setAvailableOrganizations(
          extractOrganizationsFromJamaat(jamaatJson)
        );

        if (!DAFTERS || DAFTERS.length === 0) {
          setAvailableDafters(
            extractDaftersFromAmela(amelaJson)
          );
        }

        if (
          (!initialTemplates || initialTemplates.length === 0) &&
          templatesRaw
        ) {
          setTemplates(parseInitialTemplates(templatesRaw));
        }
      } catch (err) {
        console.error(
          "Failed to load template configuration:",
          err
        );
      }
    };

    loadDynamicData();
  }, [initialTemplates, DAFTERS]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const reaches = parseArray(template.reach);
      const organizations = parseArray(template.organization);
      const dafters = parseArray(template.dafter);

      const reachMatches =
        selectedReachFilter === "সমস্ত" ||
        reaches.includes(selectedReachFilter);

      const organizationMatches =
        selectedOrganizationFilter === "সমস্ত" ||
        organizations.includes(selectedOrganizationFilter);

      const dafterMatches =
        selectedDafterFilter === "সমস্ত" ||
        dafters.includes(selectedDafterFilter);

      return (
        reachMatches &&
        organizationMatches &&
        dafterMatches
      );
    });
  }, [
    templates,
    selectedReachFilter,
    selectedOrganizationFilter,
    selectedDafterFilter
  ]);

  const handleCreateNew = () => {
    const maxId = templates.reduce((max, template) => {
      const numberId =
        typeof template.id === "number"
          ? template.id
          : parseInt(template.id, 10);

      return !Number.isNaN(numberId) && numberId > max
        ? numberId
        : max;
    }, 0);

    setEditingTemplate({
      id: maxId + 1,
      title: "",
      letterType: LETTER_TYPES[0] || "",
      reach: availableReaches.length > 0
        ? [availableReaches[0]]
        : [""],
      organization: availableOrganizations.length > 0
        ? [availableOrganizations[0]]
        : [""],
      dafter: availableDafters.length > 0
        ? [availableDafters[0]]
        : [""],
      variables: [],
      body: ""
    });
  };

  const handleEdit = (template) => {
    const formattedVars = Array.isArray(template.variables)
      ? template.variables.map((variable) => ({
        ...variable,
        type:
          REVERSE_TYPE_MAPPING[variable.type] ||
          variable.type ||
          "টেক্সট"
      }))
      : Object.entries(template.variables || {}).map(
        ([id, meta]) => ({
          id,
          type:
            REVERSE_TYPE_MAPPING[meta?.type] ||
            meta?.type ||
            "টেক্সট"
        })
      );

    setEditingTemplate({
      ...normalizeTemplate(template),
      reach: parseArray(template.reach),
      organization: parseArray(template.organization),
      dafter: parseArray(template.dafter),
      variables: formattedVars,
      body: template.body ?? template.content ?? ""
    });
  };

  const handleAddSelection = (field, defaultValue) => {
    setEditingTemplate((prev) => ({
      ...prev,
      [field]: [
        ...(Array.isArray(prev[field]) ? prev[field] : []),
        defaultValue || ""
      ]
    }));
  };

  const handleUpdateSelection = (field, index, value) => {
    setEditingTemplate((prev) => {
      const updated = [...(prev[field] || [])];
      updated[index] = value;

      return {
        ...prev,
        [field]: updated
      };
    });
  };

  const handleRemoveSelection = (field, index) => {
    setEditingTemplate((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter(
        (_, itemIndex) => itemIndex !== index
      )
    }));
  };

  const handleAddVariable = () => {
    setEditingTemplate((prev) => ({
      ...prev,
      variables: [
        ...prev.variables,
        {
          id: "",
          type: VARIABLE_TYPES[0] || "টেক্সট"
        }
      ]
    }));
  };

  const handleUpdateVariable = (index, field, value) => {
    setEditingTemplate((prev) => {
      const updated = [...prev.variables];

      updated[index] = {
        ...updated[index],
        [field]: value
      };

      return {
        ...prev,
        variables: updated
      };
    });
  };

  const handleRemoveVariable = (index) => {
    setEditingTemplate((prev) => ({
      ...prev,
      variables: prev.variables.filter(
        (_, itemIndex) => itemIndex !== index
      )
    }));
  };

  const persistTemplatesList = async (updatedList) => {
    /*
     * Arrays are now part of every template:
     *
     * reach: []
     * organization: []
     * dafter: []
     *
     * The arrays are retained directly in templates.json.
     * No filtering information is inferred from the filename,
     * title, or nesting.
     */

    const normalizedList = updatedList.map((template) => ({
      ...template,
      reach: uniqueValues(template.reach),
      organization: uniqueValues(template.organization),
      dafter: sortDaftersByHierarchy(
        parseArray(template.dafter)
      )
    }));

    const templatesPath =
      await getDataFilePath("templates.json");

    await writeTextFile(
      templatesPath,
      JSON.stringify(normalizedList, null, 2)
    );
  };

  const handleSave = async () => {
    if (!editingTemplate.title.trim()) {
      alert("বিষয় আবশ্যক।");
      return;
    }

    const cleanReach = uniqueValues(
      editingTemplate.reach || []
    );

    const cleanOrganizations = uniqueValues(
      editingTemplate.organization || []
    );

    const cleanDafters = sortDaftersByHierarchy(
      editingTemplate.dafter || []
    );

    if (cleanReach.length === 0) {
      alert("কমপক্ষে একটি পর্যায় নির্বাচন করুন।");
      return;
    }

    if (cleanOrganizations.length === 0) {
      alert("কমপক্ষে একটি সংগঠন নির্বাচন করুন।");
      return;
    }

    if (cleanDafters.length === 0) {
      alert("কমপক্ষে একটি দপ্তর নির্বাচন করুন।");
      return;
    }

    const variablesObject = {};

    editingTemplate.variables.forEach((variable) => {
      const id = String(variable.id || "").trim();

      if (!id) return;

      const englishType =
        TYPE_MAPPING[variable.type] ||
        variable.type ||
        "text";

      variablesObject[id] = {
        type: englishType,
        value: ""
      };
    });

    const finalizedTemplate = {
      ...editingTemplate,
      reach: cleanReach,
      organization: cleanOrganizations,
      dafter: cleanDafters,
      letterType: editingTemplate.letterType || "",
      variables: variablesObject
    };

    const existingIndex = templates.findIndex(
      (template) =>
        template.id === finalizedTemplate.id
    );

    const updatedList =
      existingIndex >= 0
        ? templates.map((template, index) =>
          index === existingIndex
            ? finalizedTemplate
            : template
        )
        : [...templates, finalizedTemplate];

    setTemplates(updatedList);

    if (onSaveTemplate) {
      onSaveTemplate(
        finalizedTemplate,
        updatedList
      );
    }

    setEditingTemplate(null);

    try {
      await persistTemplatesList(updatedList);
      alert("Template saved successfully!");
    } catch (err) {
      console.error(
        "Failed to write templates.json:",
        err
      );

      alert("সংরক্ষণ করা যায়নি: " + err);
    }
  };

  const handleDeleteTemplate = async (
    template,
    event
  ) => {
    event?.stopPropagation();

    if (
      !window.confirm(
        `"${template.title || "এই খসড়া"}" স্থায়ীভাবে মুছে ফেলতে চান?`
      )
    ) {
      return;
    }

    const updatedList = templates.filter(
      (item) => item.id !== template.id
    );

    setTemplates(updatedList);

    if (onSaveTemplate) {
      onSaveTemplate(null, updatedList);
    }

    try {
      await persistTemplatesList(updatedList);
    } catch (err) {
      console.error(
        "Failed to write templates.json:",
        err
      );

      alert("খসড়া মুছে ফেলা যায়নি।");
    }
  };

  const renderBodyPreview = (body) => {
    let rawText = "";

    if (typeof body === "string") {
      rawText = body;
    } else if (body && typeof body === "object") {
      const extractText = (node) => {
        if (!node) return "";

        if (node.type === "text" && node.text) {
          return node.text;
        }

        if (Array.isArray(node.content)) {
          return node.content
            .map(extractText)
            .join(" ");
        }

        return "";
      };

      rawText = extractText(body);
    }

    if (!rawText) return null;

    const parts = rawText.split(
      /(\{\{[^}]+\}\})/g
    );

    return parts.map((part, index) => {
      if (
        part.startsWith("{{") &&
        part.endsWith("}}")
      ) {
        const variableName = part.slice(2, -2);

        return (
          <code
            key={index}
            className="inline-block bg-neutral-200 dark:bg-neutral-800 mx-0.5 px-1.5 py-0.5 border border-neutral-300 dark:border-neutral-700 rounded font-bengali text-neutral-800 dark:text-neutral-200 text-xs"
          >
            {variableName}
          </code>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  if (editingTemplate) {
    return (
      <form onSubmit={(event) => event.preventDefault()}>
        <div className="separator">বিষয়</div>

        <div className="mb-3">
          <div className="gap-2 grid grid-cols-[1.5fr_0.5fr]">
            {renderStandardInput(
              "title",
              "বিষয়",
              editingTemplate.title,
              (event) =>
                setEditingTemplate((prev) => ({
                  ...prev,
                  title: event.target.value
                })),
              {
                className:
                  "font-bengali"
              }
            )}

            <HybridInput
              label="চিঠির ধরন"
              name="letterType"
              placeholderInitial="চিঠির ধরন"
              defaultValue={
                LETTER_TYPES[0] || ""
              }
              options={LETTER_TYPES}
              value={
                editingTemplate.letterType || ""
              }
              title={`চিঠির ধরন: ${editingTemplate.letterType || ""
                }`}
              onChange={(event) =>
                setEditingTemplate((prev) => ({
                  ...prev,
                  letterType:
                    event.target.value
                }))
              }
              className="w-full font-bengali"
            />
          </div>
        </div>

        <div className="separator">পর্যায়</div>

        <SelectionList
          label="পর্যায়"
          values={editingTemplate.reach}
          options={availableReaches}
          placeholder="পর্যায়"
          addTitle="পর্যায় যোগ করুন"
          onAdd={() =>
            handleAddSelection(
              "reach",
              availableReaches[0] || ""
            )
          }
          onUpdate={(index, value) =>
            handleUpdateSelection(
              "reach",
              index,
              value
            )
          }
          onRemove={(index) =>
            handleRemoveSelection(
              "reach",
              index
            )
          }
        />

        <div className="mt-4 separator">
          সংগঠন
        </div>

        <SelectionList
          label="সংগঠন"
          values={editingTemplate.organization}
          options={availableOrganizations}
          placeholder="সংগঠন"
          addTitle="সংগঠন যোগ করুন"
          onAdd={() =>
            handleAddSelection(
              "organization",
              availableOrganizations[0] || ""
            )
          }
          onUpdate={(index, value) =>
            handleUpdateSelection(
              "organization",
              index,
              value
            )
          }
          onRemove={(index) =>
            handleRemoveSelection(
              "organization",
              index
            )
          }
        />

        <div className="mt-4 separator">
          দপ্তর
        </div>

        <SelectionList
          label="দপ্তর"
          values={editingTemplate.dafter}
          options={availableDafters}
          placeholder="দপ্তর"
          addTitle="দপ্তর যোগ করুন"
          onAdd={() =>
            handleAddSelection(
              "dafter",
              availableDafters[0] || ""
            )
          }
          onUpdate={(index, value) =>
            handleUpdateSelection(
              "dafter",
              index,
              value
            )
          }
          onRemove={(index) =>
            handleRemoveSelection(
              "dafter",
              index
            )
          }
        />

        <div className="mt-4 separator">
          কাঙ্খিত তথ্য
        </div>

        <div className="space-y-2 mb-2">
          {editingTemplate.variables.map(
            (variable, index) => {
              const isLast =
                index ===
                editingTemplate.variables.length - 1;

              return (
                <div
                  key={index}
                  className="flex items-end gap-2 w-full"
                >
                  {renderStandardInput(
                    `var-id-${index}`,
                    "কী জিজ্ঞাসা করবেন?",
                    variable.id,
                    (event) =>
                      handleUpdateVariable(
                        index,
                        "id",
                        event.target.value
                      ),
                    {
                      className:
                        "font-bengali"
                    }
                  )}

                  <HybridInput
                    label="ধরন"
                    name={`var-type-${index}`}
                    placeholderInitial="ধরন"
                    defaultValue={
                      VARIABLE_TYPES[0] ||
                      "টেক্সট"
                    }
                    options={VARIABLE_TYPES}
                    value={variable.type}
                    title={`ধরন: ${variable.type || ""
                      }`}
                    onChange={(event) =>
                      handleUpdateVariable(
                        index,
                        "type",
                        event.target.value
                      )
                    }
                    className="w-full font-bengali"
                  />

                  <div className="flex items-center gap-0.5 pb-0.5 shrink-0">
                    <button
                      type="button"
                      title="তথ্য মুছুন"
                      onClick={() =>
                        handleRemoveVariable(index)
                      }
                    >
                      <Trash2 />
                    </button>

                    {isLast && (
                      <button
                        type="button"
                        title="তথ্য যোগ করুন"
                        onClick={handleAddVariable}
                      >
                        <Plus />
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>

        {editingTemplate.variables.length === 0 && (
          <button
            type="button"
            title="তথ্য যোগ করুন"
            className="flex justify-center items-center mb-4 w-full"
            onClick={handleAddVariable}
          >
            <Plus />
          </button>
        )}

        <div className="separator">
          মূল লেখা
        </div>

        <TextEditor
          value={editingTemplate.body}
          placeholder="মূল লেখা..."
          onChange={(content) =>
            setEditingTemplate((prev) => ({
              ...prev,
              body: content
            }))
          }
        />

        <div className="flex items-center gap-0.5 mt-2">
          <button
            type="button"
            title="ফিরে যান"
            onClick={() =>
              setEditingTemplate(null)
            }
            className="flex justify-center items-center"
          >
            <ArrowLeft />
          </button>

          <button
            type="button"
            title="সংরক্ষণ"
            onClick={handleSave}
            className="flex justify-center items-center"
          >
            <Save />
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="w-full">
      {/* All three filters deliberately remain on one row. */}
      <div className="flex items-end gap-2 mb-4 w-full">
        <div className="flex-1 min-w-0">
          <HybridInput
            label="পর্যায়"
            name="filter-reach"
            placeholderInitial="পর্যায়"
            defaultValue="সমস্ত"
            options={[
              "সমস্ত",
              ...availableReaches
            ]}
            value={selectedReachFilter}
            title={`পর্যায়: ${selectedReachFilter || ""
              }`}
            onChange={(event) =>
              setSelectedReachFilter(
                event.target.value
              )
            }
            className="w-full font-bengali"
          />
        </div>

        <div className="flex-1 min-w-0">
          <HybridInput
            label="সংগঠন"
            name="filter-organization"
            placeholderInitial="সংগঠন"
            defaultValue="সমস্ত"
            options={[
              "সমস্ত",
              ...availableOrganizations
            ]}
            value={
              selectedOrganizationFilter
            }
            title={`সংগঠন: ${selectedOrganizationFilter || ""
              }`}
            onChange={(event) =>
              setSelectedOrganizationFilter(
                event.target.value
              )
            }
            className="w-full font-bengali"
          />
        </div>

        <div className="flex-1 min-w-0">
          <HybridInput
            label="দপ্তর"
            name="filter-dafter"
            placeholderInitial="দপ্তর"
            defaultValue="সমস্ত"
            options={[
              "সমস্ত",
              ...availableDafters
            ]}
            value={selectedDafterFilter}
            title={`দপ্তর: ${selectedDafterFilter || ""
              }`}
            onChange={(event) =>
              setSelectedDafterFilter(
                event.target.value
              )
            }
            className="w-full font-bengali"
          />
        </div>

        <button
          type="button"
          title="নতুন খসড়া তৈরি করুন"
          onClick={handleCreateNew}
          className="flex justify-center items-center gap-1 pb-0.5 font-bengali shrink-0"
        >
          <Plus />
        </button>
      </div>

      <div className="separator">
        খসড়ার তালিকা
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="opacity-70 py-6 font-bengali text-center">
          কোনো খসড়া পাওয়া যায়নি।
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTemplates.map((template) => {
            const varKeys = Array.isArray(
              template.variables
            )
              ? template.variables.map(
                (variable) => variable.id
              )
              : Object.keys(
                template.variables || {}
              );

            const reaches = parseArray(
              template.reach
            );

            const organizations = parseArray(
              template.organization
            );

            const dafters = sortDaftersByHierarchy(
              parseArray(template.dafter)
            );

            return (
              <div
                key={template.id}
                className="border-b"
              >
                <div
                  onClick={() =>
                    handleEdit(template)
                  }
                  className="group relative hover:bg-black dark:hover:bg-white p-3 hover:text-white dark:hover:text-black transition-colors cursor-none"
                >
                  <div className="right-2 bottom-2 z-20 absolute flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      title="মুছে ফেলুন"
                      onClick={(event) =>
                        handleDeleteTemplate(
                          template,
                          event
                        )
                      }
                      className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-6 h-6"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      title="সম্পাদনা"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleEdit(template);
                      }}
                      className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-6 h-6"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                    {reaches.length > 0 && (
                      <span className="font-bengali font-bold text-xs">
                        {reaches.join(", ")}
                      </span>
                    )}

                    {organizations.length > 0 && (
                      <span className="font-bengali text-xs">
                        {organizations.join(", ")}
                      </span>
                    )}

                    {dafters.length > 0 && (
                      <span className="font-bengali text-xs">
                        {dafters.join(", ")}
                      </span>
                    )}
                  </div>

                  <div className="mb-1 font-bengali font-bold text-base">
                    {template.title}
                  </div>

                  {template.letterType && (
                    <div className="opacity-60 mb-1 font-bengali text-xs">
                      {template.letterType}
                    </div>
                  )}

                  <div className="opacity-80 mb-2 pr-4 font-bengali text-sm line-clamp-1">
                    {renderBodyPreview(
                      template.body
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {varKeys
                      .filter(Boolean)
                      .map((variableKey) => (
                        <span
                          key={variableKey}
                          className="flex items-center gap-1 opacity-90 px-1.5 py-0.5 border font-bengali text-xs"
                        >
                          <Tag className="opacity-60 w-3 h-3" />
                          <span className="font-semibold">
                            {variableKey}
                          </span>
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}