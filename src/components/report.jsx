import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Trash2,
  Save,
  Printer,
  Send,
  FileText,
} from "lucide-react";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { registerLocale } from "react-datepicker";
import { bn } from "date-fns/locale";

import { invoke } from "@tauri-apps/api/core";
import { buildPdfFromElements, printPdfSilent } from "../lib/pdfExport";

import {
  getOptions,
} from "../lib/amelaInfo";

import {
  BENGALI_MONTHS,
  toBanglaDigits,
  fromBanglaDigits,
  parseStoredDate,
  storeDate,
  calculateFiscalYear,
  loadJsonDataFile,
} from "../lib/letterUtils";

import ReportBoilerplate from "./report-boilerplate";
import HybridInput, { renderStandardInput } from "./hybrid-input";
import { clone } from "../lib/letterUtils";

registerLocale("bn", bn);

const displayDate = "dd MMMM, yyyy";

/* -------------------------------------------------------------------------- */
/* Date input                                                                 */
/* -------------------------------------------------------------------------- */

const BengaliInput = React.forwardRef(
  (props, ref) => (
    <input
      {...props}
      ref={ref}
      value={toBanglaDigits(
        props.value || ""
      )}
      title={`তারিখ: ${props.value || ""}`}
      className="w-full cursor-none"
      readOnly
    />
  )
);

BengaliInput.displayName =
  "BengaliInput";

/* -------------------------------------------------------------------------- */
/* Letter records                                                             */
/* -------------------------------------------------------------------------- */

const getStoredDateForLetter = (
  letter
) =>
  letter?.date ||
  letter?.subjects?.[0]?.date ||
  letter?.subject?.date ||
  "";

const normalizeVariableMap = (
  variables
) => {
  if (!variables) return {};

  if (Array.isArray(variables)) {
    const result = {};

    variables.forEach((item) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return;
      }

      const name =
        item.name ||
        item.key ||
        item.placeholder ||
        item.label;

      if (!name) return;

      result[name] = {
        type:
          item.type || "text",
        value:
          item.value ??
          item.defaultValue ??
          "",
      };
    });

    return result;
  }

  if (
    typeof variables !== "object"
  ) {
    return {};
  }

  return variables;
};

const getLetterSubjects = (
  letter
) => {
  if (
    Array.isArray(
      letter?.subjects
    )
  ) {
    return letter.subjects;
  }

  if (letter?.subject) {
    return [
      letter.subject,
    ];
  }

  return [];
};

const normalizeLetterRecords = (
  letters
) => {
  const records = [];

  for (
    const letter of Array.isArray(letters)
      ? letters
      : []
  ) {
    const date =
      getStoredDateForLetter(
        letter
      );

    const parsedDate =
      parseStoredDate(date);

    const subjects =
      getLetterSubjects(
        letter
      );

    const path = String(
      letter?.filepath ||
      letter?.path ||
      ""
    ).replace(/\\/g, "/");

    const direction =
      letter?.type ||
      (path.includes("প্রাপ্ত")
        ? "প্রাপ্ত"
        : "প্রেরিত");

    for (
      const subject of subjects
    ) {
      const variables =
        normalizeVariableMap(
          subject?.variables
        );

      records.push({
        letter,
        subject:
          typeof subject === "string"
            ? subject
            : subject?.subject || "",
        variables,
        date,
        parsedDate,
        direction,
        reach:
          letter?.["sender-reach"] ||
          letter?.senderReach ||
          "",
        receiverReach:
          letter?.["receiver-reach"] ||
          letter?.receiverReach ||
          "",
        senderOrganization:
          letter?.["sender-department"] ||
          letter?.senderDepartment ||
          "",
        receiverOrganization:
          letter?.["receiver-department"] ||
          letter?.receiverDepartment ||
          "",
        dafter:
          letter?.dafter || "",
      });
    }
  }

  return records;
};

const toNumber = (
  value
) => {
  if (typeof value === "number") {
    return value;
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const normalized =
    fromBanglaDigits(
      String(value)
    )
      .replace(/,/g, "")
      .replace(
        /[^0-9.+-]/g,
        ""
      );

  const numeric =
    Number(normalized);

  return Number.isFinite(
    numeric
  )
    ? numeric
    : 0;
};

/* -------------------------------------------------------------------------- */
/* Letter/report calculation engine                                           */
/* -------------------------------------------------------------------------- */

const getRecordFiscalYear = (
  record
) => {
  if (!record?.date) {
    return "";
  }

  const fiscal =
    calculateFiscalYear(
      record.date,
      record.senderOrganization ||
      ""
    );

  return `${fiscal.start}-${fiscal.end}`;
};

const matchesTimeframe = (
  record,
  timeframe,
  reportDate
) => {
  if (!record?.parsedDate) {
    return false;
  }

  const selectedDate =
    parseStoredDate(
      reportDate
    );

  if (!selectedDate) {
    return false;
  }

  if (
    !timeframe ||
    timeframe === "month"
  ) {
    return (
      record.parsedDate.getFullYear() ===
      selectedDate.getFullYear() &&
      record.parsedDate.getMonth() ===
      selectedDate.getMonth()
    );
  }

  if (
    timeframe === "year"
  ) {
    return (
      record.parsedDate.getFullYear() ===
      selectedDate.getFullYear()
    );
  }

  if (
    timeframe ===
    "fiscalYear"
  ) {
    return (
      getRecordFiscalYear(
        record
      ) ===
      `${calculateFiscalYear(
        reportDate,
        ""
      ).start}-${calculateFiscalYear(
        reportDate,
        ""
      ).end}`
    );
  }

  if (
    typeof timeframe ===
    "object"
  ) {
    const from =
      parseStoredDate(
        timeframe.from || ""
      );

    const to =
      parseStoredDate(
        timeframe.to || ""
      );

    if (
      from &&
      record.parsedDate < from
    ) {
      return false;
    }

    if (
      to &&
      record.parsedDate > to
    ) {
      return false;
    }

    if (
      timeframe.month !==
      undefined &&
      record.parsedDate.getMonth() +
      1 !==
      Number(
        timeframe.month
      )
    ) {
      return false;
    }

    if (
      timeframe.year !==
      undefined &&
      record.parsedDate.getFullYear() !==
      Number(
        timeframe.year
      )
    ) {
      return false;
    }

    return true;
  }

  return true;
};

const recordMatchesScope = (
  record,
  calculation,
  formValues
) => {
  if (
    calculation.reach &&
    calculation.reach !== "all"
  ) {
    const reach =
      calculation.direction ===
        "received"
        ? record.receiverReach
        : record.reach;

    if (
      reach !==
      calculation.reach
    ) {
      return false;
    }
  }

  if (
    calculation.organization &&
    calculation.organization !==
    "all"
  ) {
    const organization =
      calculation.direction ===
        "received"
        ? record.receiverOrganization
        : record.senderOrganization;

    if (
      organization !==
      calculation.organization
    ) {
      return false;
    }
  }

  if (
    calculation.direction
  ) {
    if (
      calculation.direction ===
      "received" &&
      record.direction !==
      "প্রাপ্ত"
    ) {
      return false;
    }

    if (
      calculation.direction ===
      "sent" &&
      record.direction ===
      "প্রাপ্ত"
    ) {
      return false;
    }
  }

  if (
    calculation.dafter &&
    record.dafter !==
    calculation.dafter
  ) {
    return false;
  }

  if (
    calculation.jamaat &&
    calculation.jamaat !==
    formValues.jamaat
  ) {
    return false;
  }

  return true;
};

const resolveLetterCalculation = (
  calculation,
  records,
  formValues
) => {
  if (!calculation) {
    return null;
  }

  const spec =
    typeof calculation ===
      "string"
      ? {
        op: "value",
        subject:
          calculation,
      }
      : calculation;

  if (
    !spec ||
    typeof spec !==
    "object"
  ) {
    return null;
  }

  const matchingRecords =
    records.filter(
      (record) => {
        if (
          spec.subject &&
          record.subject !==
          spec.subject
        ) {
          return false;
        }

        if (
          !matchesTimeframe(
            record,
            spec.timeframe,
            formValues.date
          )
        ) {
          return false;
        }

        return recordMatchesScope(
          record,
          spec,
          formValues
        );
      }
    );

  switch (
  spec.op ||
  spec.operation
  ) {
    case "value":
      {
        const first =
          matchingRecords[0];

        if (
          !first ||
          !spec.variable
        ) {
          return "";
        }

        return (
          first.variables?.[
            spec.variable
          ]?.value ??
          first.variables?.[
          spec.variable
          ] ??
          ""
        );
      }

    case "sum":
      return matchingRecords.reduce(
        (sum, record) => {
          const value =
            record.variables?.[
              spec.variable
            ]?.value ??
            record.variables?.[
            spec.variable
            ];

          return (
            sum + toNumber(value)
          );
        },
        0
      );

    case "letter-count":
    case "countLetters":
      return matchingRecords.length;

    case "report-count":
    case "countReports":
      return matchingRecords.length;

    case "countValues":
      return matchingRecords.filter(
        (record) => {
          const value =
            record.variables?.[
              spec.variable
            ]?.value ??
            record.variables?.[
            spec.variable
            ];

          if (
            spec.equals ===
            undefined
          ) {
            return (
              value !==
              undefined &&
              value !== null &&
              value !== ""
            );
          }

          return (
            String(value) ===
            String(spec.equals)
          );
        }
      ).length;

    default:
      return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Calculation resolver                                                       */
/* -------------------------------------------------------------------------- */

const resolveCalculation = (
  field,
  records,
  formValues
) => {
  const calculation =
    field?.calculation;

  if (!calculation) {
    return null;
  }

  /*
   * Local report calculations:
   *
   * {
   *   "op": "sum",
   *   "fields": ["a", "b"]
   * }
   *
   * are calculated directly from the report fields.
   */
  if (
    typeof calculation ===
    "object" &&
    calculation.op ===
    "sum" &&
    Array.isArray(
      calculation.fields
    )
  ) {
    return calculation.fields.reduce(
      (sum, fieldId) =>
        sum +
        toNumber(
          formValues[fieldId]
        ),
      0
    );
  }

  /*
   * Letter/report database calculations:
   *
   * {
   *   "op": "letter-count"
   * }
   *
   * or more detailed subject/variable
   * calculations are resolved against
   * the .letter records.
   */
  return resolveLetterCalculation(
    calculation,
    records,
    formValues
  );
};

/* -------------------------------------------------------------------------- */
/* Field width calculation                                                    */
/* -------------------------------------------------------------------------- */

const getFieldWeight = (
  field
) => {
  const labelLength =
    String(
      field?.label || ""
    ).length;

  if (
    labelLength <= 8
  ) {
    return 1;
  }

  if (
    labelLength <= 16
  ) {
    return 1.35;
  }

  if (
    labelLength <= 26
  ) {
    return 1.75;
  }

  if (
    labelLength <= 40
  ) {
    return 2.25;
  }

  return 3;
};

const calculateRowTemplateColumns =
  (row) =>
    (
      Array.isArray(row)
        ? row
        : []
    )
      .map(
        (field) =>
          `${getFieldWeight(
            field
          )}fr`
      )
      .join(" ");

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function Report({
  initialValues = {},
}) {
  const [
    reportDefinitions,
    setReportDefinitions,
  ] = useState([]);

  const [
    letters,
    setLetters,
  ] = useState([]);

  const [
    formValues,
    setFormValues,
  ] = useState(() => ({
    reach:
      initialValues.reach ||
      "",
    organization:
      initialValues.organization ||
      "",
    jamaat:
      initialValues.jamaat ||
      "",
    type:
      initialValues.type ||
      "",
    date:
      initialValues.date ||
      storeDate(new Date()),
    "fy-start":
      initialValues[
      "fy-start"
      ] || "",
    "fy-end":
      initialValues[
      "fy-end"
      ] || "",
    month:
      initialValues.month ||
      "",
    ...(
      initialValues.fields ||
      {}
    ),
  }));

  const [
    history,
    setHistory,
  ] = useState(() => [
    clone(formValues),
  ]);

  const [
    historyIndex,
    setHistoryIndex,
  ] = useState(0);

  const [
    previewImage,
    setPreviewImage,
  ] = useState(null);

  const [previewScale, setPreviewScale] = useState(1);

  const formRef =
    useRef(null);

  const pagesRef =
    useRef([]);

  const dialogRef =
    useRef(null);

  const previewContainerRef = useRef(null);

  useEffect(() => {
    if (!previewContainerRef.current) return;

    const PAGE_WIDTH_PX = 210 * 3.7795; // 210mm at 96 CSS px/in ≈ 794px

    const updateScale = () => {
      const containerWidth = previewContainerRef.current.clientWidth;
      setPreviewScale(Math.min(1, containerWidth / PAGE_WIDTH_PX));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(previewContainerRef.current);
    return () => observer.disconnect();
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Load configuration                                                     */
  /* Date / month / fiscal year                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let active = true;

    const loadData =
      async () => {
        try {
          const [
            reports,
          ] = await Promise.all([
            loadJsonDataFile(
              "report.json",
              []
            ),
          ]);

          if (!active) {
            return;
          }

          setReportDefinitions(
            Array.isArray(
              reports
            )
              ? reports
              : []
          );
        } catch (error) {
          console.error(
            "Failed to load report.json:",
            error
          );

          if (active) {
            setReportDefinitions(
              []
            );
          }
        }
      };

    loadData();

    return () => {
      active = false;
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Load saved letters                                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let active = true;

    const loadLetters =
      async () => {
        try {
          const result =
            await invoke(
              "get_all_letters"
            );

          if (
            active
          ) {
            setLetters(
              Array.isArray(
                result
              )
                ? result
                : []
            );
          }
        } catch (error) {
          console.error(
            "Failed to load .letter data for report:",
            error
          );

          if (active) {
            setLetters(
              []
            );
          }
        }
      };

    loadLetters();

    return () => {
      active = false;
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Options from report.json                                               */
  /* ---------------------------------------------------------------------- */

  const reachOptions = useMemo(() => [
    ...new Set(
      reportDefinitions.map((definition) => definition?.reach).filter(Boolean)
    ),
  ], [reportDefinitions]);

  const organizationOptions = useMemo(() => [
    ...new Set(
      reportDefinitions
        .filter((definition) => !formValues.reach || definition?.reach === formValues.reach)
        .map((definition) => definition?.organization)
        .filter(Boolean)
    ),
  ], [reportDefinitions, formValues.reach]);

  const reportTypeOptions = useMemo(() => [
    ...new Set(
      reportDefinitions
        .filter((definition) =>
          (!formValues.reach || definition?.reach === formValues.reach) &&
          (!formValues.organization || definition?.organization === formValues.organization)
        )
        .map((definition) => definition?.type)
        .filter(Boolean)
    ),
  ], [reportDefinitions, formValues.reach, formValues.organization]);

  /*
   * Do not force a value back into these fields when the user deliberately
   * erases one. The old implementation treated an empty value as invalid and
   * immediately restored the first option, which made the inputs impossible
   * to clear.
   *
   * Initial values are supplied only once, after report.json has loaded.
   * Subsequent changes are handled by handleInput(), which also clears
   * dependent fields when their parent selection changes.
   */
  const initializedOptionsRef = useRef(false);
  useEffect(() => {
    if (initializedOptionsRef.current || !reportDefinitions.length) return;

    initializedOptionsRef.current = true;
    setFormValues((previous) => ({
      ...previous,
      reach: previous.reach || reachOptions[0] || "",
      organization: previous.organization || organizationOptions[0] || "",
      type: previous.type || reportTypeOptions[0] || "",
    }));
  }, [reportDefinitions.length, reachOptions, organizationOptions, reportTypeOptions]);

  /* ---------------------------------------------------------------------- */
  /* Jamaat options                                                         */
  /* ---------------------------------------------------------------------- */

  const jamaatOptionsFetcher = useCallback(
    () => getOptions("jamaat", { reach: formValues.reach }),
    [formValues.reach]
  );

  /* ---------------------------------------------------------------------- */
  /* Date / month / fiscal year                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (
      !formValues.date
    ) {
      return;
    }

    const parsed =
      parseStoredDate(
        formValues.date
      );

    if (!parsed) {
      return;
    }

    /*
     * Fiscal-year calculation is deliberately delegated to
     * letterUtils, exactly as letter-report does.
     */
    const fiscal =
      calculateFiscalYear(
        formValues.date,
        formValues.organization ||
        ""
      );

    const month =
      BENGALI_MONTHS[
      parsed.getMonth()
      ] || "";

    setFormValues(
      (previous) => {
        if (
          previous.month ===
          month &&
          previous[
          "fy-start"
          ] === fiscal.start &&
          previous[
          "fy-end"
          ] === fiscal.end
        ) {
          return previous;
        }

        return {
          ...previous,
          month,
          "fy-start":
            fiscal.start,
          "fy-end":
            fiscal.end,
        };
      }
    );
  }, [
    formValues.date,
    formValues.organization,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Active report definition                                               */
  /* ---------------------------------------------------------------------- */

  const activeDefinition =
    useMemo(() => {
      if (
        !formValues.reach ||
        !formValues.organization ||
        !formValues.type
      ) {
        return null;
      }

      return (
        reportDefinitions.find(
          (definition) =>
            definition?.reach ===
            formValues.reach &&
            definition?.organization ===
            formValues.organization &&
            definition?.type ===
            formValues.type
        ) || null
      );
    }, [
      reportDefinitions,
      formValues.reach,
      formValues.organization,
      formValues.type,
    ]);

  /* ---------------------------------------------------------------------- */
  /* Letter records                                                          */
  /* ---------------------------------------------------------------------- */

  const letterRecords =
    useMemo(
      () =>
        normalizeLetterRecords(
          letters
        ),
      [letters]
    );

  /* ---------------------------------------------------------------------- */
  /* Form state                                                              */
  /* ---------------------------------------------------------------------- */

  const updateForm =
    useCallback(
      (
        nextValues,
        addHistory = true
      ) => {
        const next =
          clone(nextValues);

        setFormValues(next);

        if (
          !addHistory
        ) {
          return;
        }

        setHistory(
          (previous) => {
            const trimmed =
              previous.slice(
                0,
                historyIndex + 1
              );

            return [
              ...trimmed,
              next,
            ];
          }
        );

        setHistoryIndex(
          (previous) =>
            previous + 1
        );
      },
      [historyIndex]
    );

  const handleInput = useCallback((event) => {
    const { name, value } = event.target;
    const next = { ...formValues, [name]: value };

    // Only clear dependent fields when their parent actually changes.
    // Empty values must remain empty instead of being immediately restored.
    if (name === "reach" && value !== formValues.reach) {
      next.organization = "";
      next.jamaat = "";
      next.type = "";
    } else if (name === "organization" && value !== formValues.organization) {
      next.type = "";
    }

    updateForm(next);
  }, [formValues, updateForm]);

  const setFieldValue =
    useCallback(
      (
        fieldId,
        value
      ) => {
        updateForm({
          ...formValues,
          [fieldId]:
            value,
        });
      },
      [
        formValues,
        updateForm,
      ]
    );

  /* ---------------------------------------------------------------------- */
  /* Calculated fields                                                       */
  /* ---------------------------------------------------------------------- */

  const getFieldCurrentValue =
    useCallback(
      (field) => {
        const calculated =
          resolveCalculation(
            field,
            letterRecords,
            formValues
          );

        if (
          calculated !== null &&
          calculated !==
          undefined
        ) {
          return calculated;
        }

        return (
          formValues[
          field.id
          ] ?? ""
        );
      },
      [
        letterRecords,
        formValues,
      ]
    );

  const calculateInitialValuesFromDefinition =
    useCallback(
      (
        definition,
        values
      ) => {
        const next =
          clone(values);

        for (
          const section of
          definition?.sections ||
          []
        ) {
          for (
            const row of
            section.rows ||
            []
          ) {
            for (
              const field of
              Array.isArray(
                row
              )
                ? row
                : []
            ) {
              if (
                !field?.id ||
                !field.calculation
              ) {
                continue;
              }

              const calculated =
                resolveCalculation(
                  field,
                  letterRecords,
                  values
                );

              if (
                calculated !==
                null &&
                calculated !==
                undefined
              ) {
                next[
                  field.id
                ] =
                  calculated;
              }
            }
          }
        }

        return next;
      },
      [letterRecords]
    );

  useEffect(() => {
    if (
      !activeDefinition
    ) {
      return;
    }

    setFormValues(
      (previous) => {
        const calculated =
          calculateInitialValuesFromDefinition(
            activeDefinition,
            previous
          );

        const changed =
          Object.keys(
            calculated
          ).some(
            (key) =>
              calculated[key] !==
              previous[key]
          );

        return changed
          ? calculated
          : previous;
      }
    );
  }, [
    activeDefinition,
    calculateInitialValuesFromDefinition,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Render report fields                                                    */
  /* ---------------------------------------------------------------------- */

  const renderField =
    (field) => {
      const value =
        getFieldCurrentValue(
          field
        );

      const readOnly =
        Boolean(
          field.calculation
        );

      switch (
      field.type
      ) {
        case "textarea":
        case "textArea":
        case "longtext":
          return (
            <div className="flex flex-col w-full min-w-0">
              <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">
                {
                  field.label
                }
              </label>
              <textarea
                name={
                  field.id
                }
                value={
                  value
                }
                readOnly={
                  readOnly
                }
                placeholder={
                  field.label
                }
                onChange={(
                  event
                ) =>
                  setFieldValue(
                    field.id,
                    event.target
                      .value
                  )
                }
                className="w-full min-h-20 font-bengali"
              />
            </div>
          );

        case "boolean":
        case "yesNo":
        case "select":
        case "choice":
          return (
            <HybridInput
              name={field.id}
              label={field.label}
              placeholderInitial={field.label}
              defaultValue={field.label}
              optionsFetcher={
                field.options ||
                (field.type === "boolean" || field.type === "yesNo"
                  ? ["হ্যাঁ", "না"]
                  : [])
              }
              value={value ?? ""}
              readOnly={readOnly}
              onChange={(event) =>
                setFieldValue(field.id, event.target.value)
              }
            />
          );

        case "currency":
        case "money":
          return (
            <div className="flex flex-col w-full min-w-0">
              <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">
                {
                  field.label
                }
              </label>
              <div className="relative w-full">
                <input
                  name={
                    field.id
                  }
                  value={toBanglaDigits(
                    value
                  )}
                  readOnly={
                    readOnly
                  }
                  inputMode="numeric"
                  placeholder={
                    field.label
                  }
                  onChange={(
                    event
                  ) =>
                    setFieldValue(
                      field.id,
                      fromBanglaDigits(
                        event.target
                          .value
                      ).replace(
                        /\D/g,
                        ""
                      )
                    )
                  }
                  className="pr-8 w-full font-bengali"
                />

                <span className="top-1/2 right-2 absolute text-gray-500 text-xs -translate-y-1/2 pointer-events-none">
                  ৳
                </span>
              </div>
            </div>
          );

        case "date":
          return (
            <div className="flex flex-col w-full min-w-0">
              <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">
                {
                  field.label
                }
              </label>
              <DatePicker
                selected={parseStoredDate(
                  value
                )}
                customInput={
                  <BengaliInput
                    placeholder={
                      field.label
                    }
                  />
                }
                onChange={(
                  date
                ) => {
                  if (
                    !date ||
                    readOnly
                  ) {
                    return;
                  }

                  setFieldValue(
                    field.id,
                    storeDate(
                      date
                    )
                  );
                }}
                locale="bn"
                dateFormat={
                  displayDate
                }
                placeholderText={
                  field.label
                }
                className="w-full cursor-none"
                readOnly={
                  readOnly
                }
              />
            </div>
          );

        case "number":
        case "person":
        case "member":
        case "class":
        case "seminar":
        case "program":
        case "meeting":
        case "hour":
        case "minute":
        case "phone":
          return (
            <div className="flex flex-col w-full min-w-0">
              <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">
                {
                  field.label
                }
              </label>
              <input
                name={
                  field.id
                }
                value={toBanglaDigits(
                  value
                )}
                readOnly={
                  readOnly
                }
                inputMode="numeric"
                placeholder={
                  field.label
                }
                onChange={(
                  event
                ) =>
                  setFieldValue(
                    field.id,
                    fromBanglaDigits(
                      event.target
                        .value
                    ).replace(
                      /\D/g,
                      ""
                    )
                  )
                }
                className="w-full font-bengali"
              />
            </div>
          );

        default:
          return (
            <HybridInput
              name={
                field.id
              }
              label={
                field.label
              }
              placeholderInitial={
                field.label
              }
              defaultValue={
                field.label
              }
              options={
                field.options ||
                []
              }
              value={
                value
              }
              readOnly={
                readOnly
              }
              type={
                field.type ===
                  "email"
                  ? "email"
                  : "text"
              }
              onChange={(
                event
              ) =>
                setFieldValue(
                  field.id,
                  event.target
                    .value
                )
              }
              className="w-full font-bengali"
            />
          );
      }
    };

  /* ---------------------------------------------------------------------- */
  /* Report rows                                                             */
  /* ---------------------------------------------------------------------- */

  const reportRows =
    useMemo(() => {
      if (
        !activeDefinition
          ?.sections
      ) {
        return [];
      }

      return activeDefinition.sections.map(
        (section) => ({
          ...section,
          rows:
            Array.isArray(
              section.rows
            )
              ? section.rows
              : [],
        })
      );
    }, [
      activeDefinition,
    ]);

  /* ---------------------------------------------------------------------- */
  /* Keyboard navigation / undo / redo                                      */
  /* ---------------------------------------------------------------------- */

  const getInputs =
    () => {
      if (
        !formRef.current
      ) {
        return [];
      }

      return Array.from(
        formRef.current.querySelectorAll(
          "input, select, textarea"
        )
      ).filter(
        (element) =>
          !element.disabled &&
          element.type !==
          "hidden"
      );
    };

  useEffect(() => {
    const handleKeyDown =
      (event) => {
        if (
          event.target
            .isContentEditable ||
          event.target.tagName ===
          "TEXTAREA"
        ) {
          return;
        }

        const inputs =
          getInputs();

        const currentIndex =
          inputs.indexOf(
            document.activeElement
          );

        if (
          event.key ===
          "Enter" ||
          event.key ===
          "ArrowDown"
        ) {
          event.preventDefault();

          if (
            currentIndex <
            inputs.length - 1
          ) {
            inputs[
              currentIndex + 1
            ]?.focus();
          }
        }

        if (
          event.key ===
          "ArrowUp"
        ) {
          event.preventDefault();

          if (
            currentIndex >
            0
          ) {
            inputs[
              currentIndex - 1
            ]?.focus();
          }
        }

        if (
          event.ctrlKey &&
          !event.shiftKey
        ) {
          if (
            event.key.toLowerCase() ===
            "z" &&
            historyIndex >
            0
          ) {
            const previous =
              history[
              historyIndex - 1
              ];

            setHistoryIndex(
              historyIndex - 1
            );

            setFormValues(
              clone(previous)
            );
          }

          if (
            event.key.toLowerCase() ===
            "y" &&
            historyIndex <
            history.length - 1
          ) {
            const next =
              history[
              historyIndex + 1
              ];

            setHistoryIndex(
              historyIndex + 1
            );

            setFormValues(
              clone(next)
            );
          }
        }
      };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
  }, [
    history,
    historyIndex,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Save payload                                                            */
  /* ---------------------------------------------------------------------- */

  const reportPayload =
    useMemo(() => {
      if (
        !activeDefinition
      ) {
        return null;
      }

      const fields =
        {};

      for (
        const section of
        activeDefinition.sections ||
        []
      ) {
        for (
          const row of
          section.rows ||
          []
        ) {
          for (
            const field of
            Array.isArray(row)
              ? row
              : []
          ) {
            fields[
              field.id
            ] =
              getFieldCurrentValue(
                field
              );
          }
        }
      }

      return {
        ...formValues,

        fields,

        reach:
          formValues.reach ||
          "",

        organization:
          formValues.organization ||
          "",

        jamaat:
          formValues.jamaat ||
          "",

        type:
          formValues.type ||
          "",

        date:
          formValues.date ||
          "",

        "fy-start":
          formValues[
          "fy-start"
          ] || "",

        "fy-end":
          formValues[
          "fy-end"
          ] || "",

        month:
          formValues.month ||
          "",

        version: 1,
      };
    }, [
      activeDefinition,
      formValues,
      getFieldCurrentValue,
    ]);

  /* ---------------------------------------------------------------------- */
  /* Save                                                                    */
  /* ---------------------------------------------------------------------- */

  const handleSave =
    async () => {
      if (
        !reportPayload
      ) {
        alert(
          "এই পর্যায়, সংগঠন ও রিপোর্ট ধরণের জন্য কোনো report.json configuration পাওয়া যায়নি।"
        );

        return null;
      }

      try {
        const saved =
          await invoke(
            "save_report",
            {
              reportData:
                clone(
                  reportPayload
                ),
            }
          );

        return saved;
      } catch (error) {
        console.error(
          "Failed to save report:",
          error
        );

        alert(
          "রিপোর্ট সংরক্ষণ করা যায়নি: " +
          error
        );

        return null;
      }
    };

  /* ---------------------------------------------------------------------- */
  /* PDF                                                                      */
  /* ---------------------------------------------------------------------- */

  const getReportPages =
    () =>
      pagesRef.current.filter(
        Boolean
      );

  const elementsToPdfBase64 = (elements) => buildPdfFromElements(elements);

  const generatePdfBase64 =
    async () =>
      elementsToPdfBase64(
        getReportPages()
      );

  const handleSaveToPdf =
    async () => {
      try {
        const pdfBase64 =
          await generatePdfBase64();

        const reportDate =
          formValues.date ||
          "Report";

        const reportType =
          formValues.type ||
          "রিপোর্ট";

        await invoke(
          "save_pdf_to_temp",
          {
            pdfBase64,
            fileName:
              `${reportType} (${reportDate}) ${formValues.organization ||
                ""
                }`.trim(),
          }
        );
      } catch (error) {
        console.error(
          "Save report PDF failed:",
          error
        );

        alert(
          "PDF সংরক্ষণ করা যায়নি: " +
          error
        );
      }
    };

  const handlePrintAndSave =
    async () => {
      try {
        const pdfBase64 =
          await generatePdfBase64();

        const saved =
          await handleSave();

        if (
          saved === null
        ) {
          return;
        }

        await printPdfSilent(
          pdfBase64
        );
      } catch (error) {
        console.error(
          "Print/save failed:",
          error
        );

        alert(
          "প্রিন্ট করা যায়নি: " +
          error
        );
      }
    };

  /* ---------------------------------------------------------------------- */
  /* Email                                                                    */
  /* ---------------------------------------------------------------------- */

  const handleSend =
    async () => {
      try {
        const saved =
          await handleSave();

        if (
          saved === null
        ) {
          return;
        }

        let password =
          localStorage.getItem(
            "smtp_app_password"
          ) || "";

        if (!password) {
          password =
            window.prompt(
              "ইমেইল পাঠানোর জন্য App Password টি লিখুন:"
            );

          if (!password) {
            return;
          }

          password =
            password.trim();

          localStorage.setItem(
            "smtp_app_password",
            password
          );
        }

        const pdfBase64 =
          await generatePdfBase64();

        const jamaatOptions =
          await jamaatOptionsFetcher();

        /*
         * Use the same hierarchy source as the letter system.
         * The selected organization is the department node.
         */
        const jamaatData =
          await loadJsonDataFile(
            "jamaat.json",
            {}
          );

        const senderEmail =
          jamaatData?.[
            formValues.reach
          ]?.[
            formValues.jamaat
          ]?.[
            formValues.organization
          ]?.email ||
          "";

        if (
          !senderEmail
        ) {
          console.warn(
            "No email address found for report organization."
          );
        }

        await invoke(
          "send_email_with_pdf",
          {
            fromEmail:
              senderEmail,
            toEmail:
              senderEmail,
            appPassword:
              password,
            subject:
              `${formValues.type || "রিপোর্ট"} (${formValues.date || ""})`.trim(),
            pdfBase64,
          }
        );

        alert(
          "ইমেইল পাঠানো হয়েছে!"
        );
      } catch (error) {
        console.error(
          "Report email dispatch failed:",
          error
        );

        alert(
          "ইমেইল পাঠানো যায়নি: " +
          error
        );
      }
    };

  /* ---------------------------------------------------------------------- */
  /* Discard                                                                 */
  /* ---------------------------------------------------------------------- */

  const handleDiscard =
    () => {
      const next = {
        reach:
          reachOptions[0] ||
          "",
        organization:
          organizationOptions[0] ||
          "",
        jamaat:
          "",
        type:
          reportTypeOptions[0] ||
          "",
        date:
          storeDate(
            new Date()
          ),
        "fy-start":
          "",
        "fy-end":
          "",
        month:
          "",
      };

      setFormValues(
        next
      );

      setHistory([
        clone(next),
      ]);

      setHistoryIndex(0);
    };

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <form
      ref={formRef}
      onSubmit={(event) =>
        event.preventDefault()
      }
      className="w-full"
    >
      <div className="separator">
        রিপোর্ট
      </div>

      <div className="gap-x-2 grid grid-cols-4 w-full">
        <HybridInput
          name="reach"
          label="পর্যায়"
          placeholderInitial="পর্যায়"
          defaultValue={
            reachOptions[0] ||
            "পর্যায়"
          }
          optionsFetcher={
            reachOptions
          }
          value={
            formValues.reach ||
            ""
          }
          onChange={
            handleInput
          }
          autoComplete="off"
          className="w-full font-bengali"
        />

        <HybridInput
          name="organization"
          label="সংগঠন"
          placeholderInitial="সংগঠন"
          defaultValue={
            organizationOptions[0] ||
            "সংগঠন"
          }
          optionsFetcher={
            organizationOptions
          }
          value={
            formValues.organization ||
            ""
          }
          onChange={
            handleInput
          }
          autoComplete="off"
          className="w-full font-bengali"
        />

        <HybridInput
          name="jamaat"
          label="জামা'ত"
          placeholderInitial="জামা'ত"
          defaultValue="নারায়ণগঞ্জ"
          optionsFetcher={
            jamaatOptionsFetcher
          }
          value={
            formValues.jamaat ||
            ""
          }
          onChange={
            handleInput
          }
          autoComplete="off"
          className="w-full font-bengali"
        />

        <HybridInput
          name="type"
          label="ধরণ"
          placeholderInitial="ধরণ"
          defaultValue={
            reportTypeOptions[0] ||
            "ধরণ"
          }
          optionsFetcher={
            reportTypeOptions
          }
          value={
            formValues.type ||
            ""
          }
          onChange={
            handleInput
          }
          autoComplete="off"
          className="w-full font-bengali"
        />
      </div>

      <div className="gap-x-2 grid grid-cols-[1fr_1fr_1fr_2fr] mt-2 w-full">
        {renderStandardInput(
          "month",
          "মাস",
          formValues.month || "",
          () => { },
          { readOnly: true, className: "w-full font-bengali" }
        )}

        {renderStandardInput(
          "fy-start",
          "অর্থবছর শুরু",
          formValues["fy-start"] || "",
          () => { },
          { readOnly: true, className: "w-full font-bengali" }
        )}

        {renderStandardInput(
          "fy-end",
          "অর্থবছর শেষ",
          formValues["fy-end"] || "",
          () => { },
          { readOnly: true, className: "w-full font-bengali" }
        )}

        <div className="flex flex-col w-full min-w-0">
          <label className="mb-0.5 text-gray-500 text-xs truncate cursor-none">তারিখ</label>
          <DatePicker
            selected={parseStoredDate(
              formValues.date
            )}
            customInput={
              <BengaliInput />
            }
            onChange={(
              date
            ) => {
              if (!date) {
                return;
              }

              updateForm({
                ...formValues,
                date:
                  storeDate(
                    date
                  ),
              });
            }}
            locale="bn"
            dateFormat={
              displayDate
            }
            placeholderText="তারিখ"
            className="w-full cursor-none"
          />
        </div>
      </div>

      {!activeDefinition ? (
        <div className="py-8 font-bengali text-gray-500 text-center">
          এই পর্যায়, সংগঠন ও রিপোর্ট ধরণের জন্য
          report.json-এ কোনো সংজ্ঞা পাওয়া যায়নি।
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {reportRows.map(
            (section) => (
              <section
                key={
                  section.id ||
                  section.title
                }
              >
                <div className="separator">
                  {
                    section.title
                  }
                </div>

                {(
                  section.rows ||
                  []
                ).map(
                  (
                    row,
                    rowIndex
                  ) => (
                    <div
                      key={`${section.id || section.title}-${rowIndex}`}
                      className="gap-x-2 grid mb-2 w-full"
                      style={{
                        gridTemplateColumns:
                          calculateRowTemplateColumns(
                            row
                          ),
                      }}
                    >
                      {(
                        Array.isArray(
                          row
                        )
                          ? row
                          : []
                      ).map(
                        (
                          field
                        ) => (
                          <div
                            key={
                              field.id
                            }
                            className="min-w-0"
                          >
                            {renderField(
                              field
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )
                )}
              </section>
            )
          )}
        </div>
      )}

      <div ref={previewContainerRef} className="mt-8 w-full print-area">
        {activeDefinition && (
          <ReportBoilerplate
            report={
              activeDefinition
            }
            formValues={
              reportPayload ||
              formValues
            }
            pagesRef={
              pagesRef
            }
            previewScale={previewScale}
          />
        )}
      </div>

      <dialog
        ref={dialogRef}
      >
        <img
          src={
            previewImage
          }
          onClick={() =>
            dialogRef.current?.close()
          }
          alt="Preview"
        />
      </dialog>

      <div className="absolute flex justify-end gap-0.5 mt-4">
        <button
          type="button"
          title="বাতিল করুন"
          onClick={
            handleDiscard
          }
        >
          <Trash2 />
        </button>

        <button
          type="button"
          title="পিডিএফ হিসেবে সংরক্ষণ করুন"
          onClick={
            handleSaveToPdf
          }
        >
          <FileText />
        </button>

        <button
          type="button"
          title="সংরক্ষণ করুন"
          onClick={
            handleSave
          }
        >
          <Save />
        </button>

        <button
          type="button"
          title="প্রিন্ট ও সংরক্ষণ করুন"
          onClick={
            handlePrintAndSave
          }
        >
          <Printer />
        </button>

        <button
          type="button"
          title="ইমেইল পাঠান"
          onClick={
            handleSend
          }
        >
          <Send />
        </button>
      </div>
    </form>
  );
}