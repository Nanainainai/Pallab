import { invoke } from "@tauri-apps/api/core";
import {
  loadJsonDataFile,
  parseStoredDate,
  toBanglaDigits,
  fromBanglaDigits,
} from "./letterUtils";

export { clone } from "./letterUtils";

export const REPORT_MONTHS = [
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

export const loadReportDefinitions = async () => {
  const data = await loadJsonDataFile("report.json");

  return Array.isArray(data)
    ? data
    : [];
};

export const getReportDefinition = (
  definitions,
  reach,
  organization,
  type
) => {
  return (
    definitions.find(
      (definition) =>
        definition?.reach === reach &&
        definition?.organization === organization &&
        definition?.type === type
    ) || null
  );
};

export const getReportReaches = (
  definitions
) =>
  [
    ...new Set(
      definitions
        .map((item) => item?.reach)
        .filter(Boolean)
    ),
  ];

export const getReportOrganizations = (
  definitions,
  reach
) =>
  [
    ...new Set(
      definitions
        .filter(
          (item) =>
            !reach ||
            item?.reach === reach
        )
        .map(
          (item) =>
            item?.organization
        )
        .filter(Boolean)
    ),
  ];

export const getReportTypes = (
  definitions,
  reach,
  organization
) =>
  [
    ...new Set(
      definitions
        .filter((item) =>
          reach
            ? item?.reach === reach
            : true
        )
        .filter((item) =>
          organization
            ? item?.organization ===
            organization
            : true
        )
        .map(
          (item) => item?.type
        )
        .filter(Boolean)
    ),
  ];

export const getMonthFromDate = (
  dateString
) => {
  if (!dateString) return "";

  const parsed =
    parseStoredDate(dateString);

  if (!parsed || isNaN(parsed)) {
    return "";
  }

  return REPORT_MONTHS[
    parsed.getMonth()
  ] || "";
};

export const getFiscalYearFromDate = (
  dateString,
  organization = ""
) => {
  const parsed =
    parseStoredDate(dateString);

  if (!parsed || isNaN(parsed)) {
    return {
      start: "",
      end: "",
    };
  }

  const year =
    parsed.getFullYear();

  const month =
    parsed.getMonth() + 1;

  const auxiliary =
    organization.includes(
      "মজলিস খোদ্দামুল আহমদীয়া"
    ) ||
    organization.includes(
      "মজলিস আতফালুল আহমদীয়া"
    );

  let start = year;
  let end = year + 1;

  if (auxiliary) {
    if (month < 11) {
      start = year - 1;
      end = year;
    }
  } else if (month < 7) {
    start = year - 1;
    end = year;
  }

  return {
    start: toBanglaDigits(
      String(start)
    ),
    end: toBanglaDigits(
      String(end).slice(-2)
    ),
  };
};

export const getLetterSubject =
  (letter) =>
    Array.isArray(letter?.subjects)
      ? letter.subjects[0] || {}
      : {};

export const getLetterVariable = (
  subject,
  variableName
) => {
  const variables =
    subject?.variables || {};

  const variable =
    variables[variableName];

  if (
    variable &&
    typeof variable === "object"
  ) {
    return variable.value ?? "";
  }

  return variable ?? "";
};

export const getLettersForMonth = (
  letters,
  dateString
) => {
  const parsed =
    parseStoredDate(dateString);

  if (!parsed || isNaN(parsed)) {
    return [];
  }

  const year =
    parsed.getFullYear();

  const month =
    parsed.getMonth();

  return letters.filter((letter) => {
    const date =
      parseStoredDate(
        letter?.date
      );

    if (!date || isNaN(date)) {
      return false;
    }

    return (
      date.getFullYear() === year &&
      date.getMonth() === month
    );
  });
};

export const getLettersForYear = (
  letters,
  year
) => {
  const numericYear =
    Number(
      fromBanglaDigits(year)
    );

  if (!numericYear) {
    return [];
  }

  return letters.filter((letter) => {
    const date =
      parseStoredDate(
        letter?.date
      );

    return (
      date &&
      !isNaN(date) &&
      date.getFullYear() ===
      numericYear
    );
  });
};

export const getLetterValuesBySubject =
  (
    letters,
    subjectName,
    variableName
  ) => {
    return letters
      .map((letter) => {
        const subject =
          getLetterSubject(
            letter
          );

        if (
          subject.subject !==
          subjectName
        ) {
          return null;
        }

        return {
          value:
            getLetterVariable(
              subject,
              variableName
            ),
          letter,
          subject,
        };
      })
      .filter(Boolean);
  };

export const countLettersBySubject =
  (
    letters,
    subjectName
  ) =>
    letters.filter(
      (letter) =>
        getLetterSubject(
          letter
        ).subject ===
        subjectName
    ).length;

const asNumber = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return 0;
  }

  const normalized =
    fromBanglaDigits(
      String(value)
    ).replace(
      /,/g,
      ""
    );

  const result =
    Number(normalized);

  return Number.isFinite(result)
    ? result
    : 0;
};

const getFieldValue = (
  values,
  fieldId
) => {
  return values?.[fieldId] ?? "";
};

const getLetterCalculationValues =
  (
    letters,
    calculation
  ) => {
    const {
      subject,
      variable,
      from,
      to,
      month,
      year,
    } = calculation;

    let filtered = letters;

    if (
      month !== undefined &&
      month !== null
    ) {
      filtered =
        filtered.filter(
          (letter) => {
            const date =
              parseStoredDate(
                letter?.date
              );

            return (
              date &&
              !isNaN(date) &&
              date.getMonth() ===
              Number(month)
            );
          }
        );
    }

    if (
      year !== undefined &&
      year !== null
    ) {
      const numericYear =
        Number(
          fromBanglaDigits(
            year
          )
        );

      filtered =
        filtered.filter(
          (letter) => {
            const date =
              parseStoredDate(
                letter?.date
              );

            return (
              date &&
              !isNaN(date) &&
              date.getFullYear() ===
              numericYear
            );
          }
        );
    }

    if (
      from ||
      to
    ) {
      filtered =
        filtered.filter(
          (letter) => {
            const date =
              parseStoredDate(
                letter?.date
              );

            if (
              !date ||
              isNaN(date)
            ) {
              return false;
            }

            if (from) {
              const fromDate =
                parseStoredDate(
                  from
                );

              if (
                fromDate &&
                date < fromDate
              ) {
                return false;
              }
            }

            if (to) {
              const toDate =
                parseStoredDate(
                  to
                );

              if (
                toDate &&
                date > toDate
              ) {
                return false;
              }
            }

            return true;
          }
        );
    }

    if (!subject) {
      return [];
    }

    return filtered.map(
      (letter) => {
        const letterSubject =
          getLetterSubject(
            letter
          );

        if (
          letterSubject.subject !==
          subject
        ) {
          return 0;
        }

        if (!variable) {
          return 1;
        }

        return asNumber(
          getLetterVariable(
            letterSubject,
            variable
          )
        );
      }
    );
  };

export const evaluateCalculation =
  (
    calculation,
    reportValues,
    letters
  ) => {
    if (
      !calculation
    ) {
      return "";
    }

    /*
     * New calculation object format.
     *
     * Examples:
     *
     * {
     *   op: "sum",
     *   fields: ["a", "b", "c"]
     * }
     *
     * {
     *   op: "letter-value",
     *   subject: "...",
     *   variable: "...",
     *   timeframe: "month"
     * }
     *
     * {
     *   op: "letter-count",
     *   subject: "...",
     *   timeframe: "month"
     * }
     */

    if (
      typeof calculation ===
      "string"
    ) {
      return "";
    }

    switch (
    calculation.op
    ) {
      case "sum":
        return (
          calculation.fields || []
        ).reduce(
          (
            total,
            field
          ) =>
            total +
            asNumber(
              getFieldValue(
                reportValues,
                field
              )
            ),
          0
        );

      case "letter-value": {
        const values =
          getLetterCalculationValues(
            letters,
            {
              subject:
                calculation.subject,
              variable:
                calculation.variable,
              month:
                calculation
                  .timeframe ===
                  "month"
                  ? calculation
                    .month
                  : undefined,
              year:
                calculation
                  .timeframe ===
                  "year"
                  ? calculation
                    .year
                  : undefined,
            }
          );

        return values.reduce(
          (
            total,
            value
          ) =>
            total +
            asNumber(value),
          0
        );
      }

      case "letter-count": {
        const filtered =
          getLetterCalculationValues(
            letters,
            {
              subject:
                calculation.subject,
              month:
                calculation
                  .timeframe ===
                  "month"
                  ? calculation
                    .month
                  : undefined,
              year:
                calculation
                  .timeframe ===
                  "year"
                  ? calculation
                    .year
                  : undefined,
            }
          );

        return filtered.length;
      }

      case "add":
        return (
          calculation.fields || []
        ).reduce(
          (
            total,
            field
          ) =>
            total +
            asNumber(
              getFieldValue(
                reportValues,
                field
              )
            ),
          0
        );

      default:
        return "";
    }
  };

export const resolveReportField =
  (
    field,
    reportValues,
    letters
  ) => {
    if (
      !field?.calculation
    ) {
      return (
        reportValues?.[
        field.id
        ] ?? ""
      );
    }

    return evaluateCalculation(
      field.calculation,
      reportValues,
      letters
    );
  };