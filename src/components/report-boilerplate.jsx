import React, { useEffect, useMemo, useRef, useState } from "react";

import MinarSource from "../assets/minar.png";

import {
  loadJsonDataFile,
  toBanglaDigits,
} from "../lib/letterUtils";

const REPORT_TABLE_WIDTH = "80%";

// A4 dimensions used by the existing preview structure.
const A4_HEIGHT_MM = 297;
const PAGE_BOTTOM_MARGIN_MM = 10;

// Approximate printable height in px used only for pagination calculation.
// The actual page remains an A4-sized element.
const PAGE_HEIGHT_PX = 1000;
const PAGE_BOTTOM_MARGIN_PX = 34;

const FIRST_PAGE_HEADER_PX = 245;
const FIRST_PAGE_CONTENT_TOP_PX = 20;
const OTHER_PAGE_CONTENT_TOP_PX = 32;

const SECTION_TITLE_PX = 24;
const NORMAL_ROW_PX = 32;
const TEXTAREA_ROW_PX = 72;

const getInputExtension = (type) => {
  const extensions = {
    number: "জন",
    people: "জন",
    person: "জন",
    member: "জন",

    amount: "টাকা",
    money: "টাকা",

    hour: "ঘণ্টা",
    hours: "ঘণ্টা",

    minute: "মিনিট",
    minutes: "মিনিট",

    leaflet: "টি",
    book: "টি",
    books: "টি",

    letter: "টি",
    letters: "টি",

    report: "টি",
    reports: "টি",

    class: "টি",
    seminar: "টি",
    program: "টি",
    programme: "টি",

    yesno: "",
    select: "",

    text: "",
    textarea: "",
    textArea: "",
    longtext: "",

    date: "",
    month: "",
    year: "",
  };

  return extensions[type] ?? "";
};

const getFieldValue = (formValues, field) => {
  if (!field) return "";

  if (
    field.id &&
    Object.prototype.hasOwnProperty.call(formValues, field.id)
  ) {
    return formValues[field.id];
  }

  if (
    field.name &&
    Object.prototype.hasOwnProperty.call(formValues, field.name)
  ) {
    return formValues[field.name];
  }

  if (
    field.label &&
    Object.prototype.hasOwnProperty.call(formValues, field.label)
  ) {
    return formValues[field.label];
  }

  return "";
};

const formatValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "হ্যাঁ" : "না";
  }

  return toBanglaDigits(value);
};

const renderFieldValue = (field, formValues) => {
  const value = formatValue(getFieldValue(formValues, field));

  if (value === "—") {
    return value;
  }

  const extension = getInputExtension(field?.type);

  return extension ? `${value} ${extension}` : value;
};

const getFieldWeight = (field) => {
  return Math.max(
    String(field?.label || "").trim().length,
    1
  );
};

const isTextareaField = (field) => {
  const type = String(field?.type || "").toLowerCase();

  return (
    type === "textarea" ||
    type === "textarea" ||
    type === "longtext"
  );
};

const getRowHeight = (row) => {
  if (!Array.isArray(row) || row.length === 0) {
    return NORMAL_ROW_PX;
  }

  return row.some(isTextareaField)
    ? TEXTAREA_ROW_PX
    : NORMAL_ROW_PX;
};

const getJamaatInfo = (
  jamaatData,
  reach,
  jamaat,
  organization
) => {
  return (
    jamaatData?.[reach]?.[jamaat]?.[organization] || {
      address: "",
      phone: "",
      email: "",
    }
  );
};

const getKayedInfo = (
  amelaData,
  reach,
  jamaat,
  organization,
  type
) => {
  // Kayed information is intentionally limited to:
  // স্থানীয় → মজলিস খোদ্দামুল আহমদীয়া → মাসিক
  if (
    reach !== "স্থানীয়" ||
    organization !== "মজলিস খোদ্দামুল আহমদীয়া" ||
    type !== "মাসিক"
  ) {
    return {
      name: "",
      phone: "",
    };
  }

  return (
    amelaData?.[reach]?.[jamaat]?.[organization]?.[
    "এতেমাদ"
    ]?.["কায়েদ"] || {
      name: "",
      phone: "",
    }
  );
};

/*
 * Pagination is calculated from the report structure, not from React DOM
 * measurements.
 *
 * Every row is treated as an indivisible unit. Therefore a row can never
 * be split between pages.
 *
 * If a row does not fit in the remaining space, the entire row starts on
 * the next page.
 */
const paginateSections = (sections) => {
  if (!Array.isArray(sections) || sections.length === 0) {
    return [];
  }

  const pages = [];

  let currentPage = [];
  let currentHeight = FIRST_PAGE_HEADER_PX;

  const getPageLimit = () =>
    PAGE_HEIGHT_PX - PAGE_BOTTOM_MARGIN_PX;

  const pushPage = () => {
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    currentPage = [];
    currentHeight = 0;
  };

  sections.forEach((section) => {
    const rows = Array.isArray(section?.rows)
      ? section.rows
      : [];

    if (rows.length === 0) {
      return;
    }

    let sectionPart = null;

    const startSection = (continuation) => {
      sectionPart = {
        ...section,
        rows: [],
        isContinuation: continuation,
      };

      currentPage.push(sectionPart);
      currentHeight += SECTION_TITLE_PX;
    };

    rows.forEach((row) => {
      const rowHeight = getRowHeight(row);

      /*
       * If this is the first row of the section, account for the
       * section title before deciding whether the row fits.
       */
      const needsSectionTitle = !sectionPart;

      const requiredHeight =
        rowHeight +
        (needsSectionTitle ? SECTION_TITLE_PX : 0);

      /*
       * If the row does not fit, move the WHOLE row to the next page.
       *
       * Important:
       * - Do not put the row on the old page.
       * - Do not split the row.
       * - Do not measure DOM.
       */
      if (
        currentPage.length > 0 &&
        currentHeight + requiredHeight > getPageLimit()
      ) {
        pushPage();

        startSection(
          pages.length > 0
        );
      } else if (needsSectionTitle) {
        startSection(false);
      }

      /*
       * A single row may technically be larger than the printable
       * area. It still remains indivisible. In that unusual case,
       * place it on its own page rather than attempting to split it.
       */
      if (
        currentHeight + rowHeight > getPageLimit() &&
        currentPage.length > 0 &&
        sectionPart.rows.length === 0
      ) {
        // The row stays intact. No further page manipulation is needed.
      }

      sectionPart.rows.push(row);
      currentHeight += rowHeight;
    });
  });

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  /*
   * Remove accidental empty pages.
   */
  return pages.filter(
    (page) => Array.isArray(page) && page.length > 0
  );
};

export default function ReportBoilerplate({
  formValues = {},
  reportDefinition = null,
  pagesRef = null,
  previewScale = 1,
}) {
  const [reportData, setReportData] = useState([]);
  const [jamaatData, setJamaatData] = useState({});
  const [amelaData, setAmelaData] = useState({});

  /*
   * Prevent stale page references from remaining after a report changes.
   * This does not update React state and therefore cannot cause an
   * update-depth loop.
   */
  const pageRefsInitialized = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [
          reports,
          jamaats,
          amela,
        ] = await Promise.all([
          loadJsonDataFile("report.json", []),
          loadJsonDataFile("jamaat.json", {}),
          loadJsonDataFile("amela.json", {}),
        ]);

        if (cancelled) return;

        setReportData(
          Array.isArray(reports) ? reports : []
        );

        setJamaatData(
          jamaats && typeof jamaats === "object"
            ? jamaats
            : {}
        );

        setAmelaData(
          amela && typeof amela === "object"
            ? amela
            : {}
        );
      } catch (err) {
        if (!cancelled) {
          console.error(
            "Failed to load report, jamaat and amela JSON data:",
            err
          );

          setReportData([]);
          setJamaatData({});
          setAmelaData({});
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const reach = formValues.reach || "";
  const organization = formValues.organization || "";
  const jamaat = formValues.jamaat || "";
  const type = formValues.type || "";

  const selectedReport = useMemo(() => {
    if (reportDefinition) {
      return reportDefinition;
    }

    return reportData.find(
      (report) =>
        report?.reach === reach &&
        report?.organization === organization &&
        report?.type === type
    );
  }, [
    reportDefinition,
    reportData,
    reach,
    organization,
    type,
  ]);

  const sections = useMemo(() => {
    return Array.isArray(selectedReport?.sections)
      ? selectedReport.sections
      : [];
  }, [selectedReport]);

  const jamaatInfo = useMemo(() => {
    return getJamaatInfo(
      jamaatData,
      reach,
      jamaat,
      organization
    );
  }, [
    jamaatData,
    reach,
    jamaat,
    organization,
  ]);

  const kayedInfo = useMemo(() => {
    return getKayedInfo(
      amelaData,
      reach,
      jamaat,
      organization,
      type
    );
  }, [
    amelaData,
    reach,
    jamaat,
    organization,
    type,
  ]);

  const month = formValues.month || "";

  const fyStart = toBanglaDigits(
    formValues.fyStart ||
    formValues["fy-start"] ||
    ""
  );

  const fyEnd = toBanglaDigits(
    formValues.fyEnd ||
    formValues["fy-end"] ||
    ""
  );

  const date = toBanglaDigits(
    formValues.date || ""
  );

  /*
   * IMPORTANT:
   *
   * This is the only place where pagination is calculated.
   * It is a pure useMemo calculation.
   *
   * There is no setState here and no DOM measurement.
   * Consequently it cannot create a maximum-update-depth loop.
   */
  const pages = useMemo(() => {
    return paginateSections(sections);
  }, [sections]);

  const renderedPages =
    pages.length > 0 ? pages : [[]];

  /*
   * Keep pagesRef synchronized without storing anything in component
   * state. This avoids the render → state update → render loop.
   */
  useEffect(() => {
    if (!pagesRef?.current) {
      return;
    }

    /*
     * Clear references belonging to pages that disappeared.
     */
    const oldLength = pagesRef.current.length;

    for (let i = renderedPages.length; i < oldLength; i += 1) {
      pagesRef.current[i] = null;
    }

    /*
     * The actual DOM references are assigned by the ref callbacks below.
     */
    pageRefsInitialized.current = true;
  }, [
    pagesRef,
    renderedPages.length,
  ]);

  const tableWidthStyle = {
    width: REPORT_TABLE_WIDTH,
  };

  return (
    <div className="flex flex-col gap-6 print:gap-0 font-bengali text-black">
      {renderedPages.map(
        (pageSections, pageIndex) => {
          const isFirstPage = pageIndex === 0;
          const isLastPage =
            pageIndex === renderedPages.length - 1;

          return (
            <div
              key={`report-page-${pageIndex}`}
              className="ml-1 print:ml-0"
              style={{
                height: `calc(${A4_HEIGHT_MM * previewScale}mm + 16px)`,
              }}
            >
              <div
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                }}
                className="print:transform-none"
              >
                <div
                  ref={(element) => {
                    if (
                      pagesRef?.current
                    ) {
                      pagesRef.current[
                        pageIndex
                      ] = element;
                    }
                  }}
                  className="box-border relative bg-white pb-[10mm] w-[210mm] min-h-[297mm] overflow-hidden page-break-after-always origin-top-left letter-page"
                >
                  {/*
                   * Background image is rendered separately for every
                   * physical page.
                   */}
                  {MinarSource && (
                    <img
                      className="bottom-0 left-0 absolute opacity-25 w-full h-auto pointer-events-none"
                      src={MinarSource}
                      alt=""
                    />
                  )}

                  <div className="z-10 relative w-full">
                    {isFirstPage && (
                      <>
                        {/*
                         * Letter-style organization header.
                         * No hardcoded organization, jamaat or contact
                         * values are used here.
                         */}
                        <div className="w-full">
                          <div
                            className="bg-gray-200 forced-color-adjust-none pt-2 pb-2 w-full text-center"
                          >
                            <div className="font-ar text-4xl">
                              9
                            </div>

                            <div className="flex flex-row justify-center items-center gap-3">
                              <div className="font-bengali text-[38px] leading-none">
                                {organization}
                                {jamaat
                                  ? `, ${jamaat}`
                                  : ""}
                              </div>
                            </div>

                            <div className="flex flex-row justify-center items-center pt-1 pb-2 font-bengali text-sm">
                              {[
                                jamaatInfo.address,
                                jamaatInfo.phone,
                                jamaatInfo.email,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          </div>

                          <div className="bg-linear-to-r from-black via-white to-black w-full h-1" />
                        </div>

                        <div className="flex flex-col items-center mt-3">
                          <div className="font-bengali font-bold text-lg">
                            {[
                              reach,
                              organization,
                              type,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            {reach ||
                              organization ||
                              type
                              ? " রিপোর্ট"
                              : ""}
                          </div>

                          {/*
                           * Fixed-width metadata table.
                           * It uses the same width as every report table.
                           */}
                          <div
                            className="mt-2 border border-black font-bengali text-xs"
                            style={tableWidthStyle}
                          >
                            <div className="grid grid-cols-[1fr_1fr]">
                              <div className="px-2 py-1 border-black border-r border-b">
                                <span>
                                  মজলিসের নাম
                                </span>

                                <span className="ml-2 font-bold">
                                  {jamaat}
                                </span>
                              </div>

                              <div className="px-2 py-1 border-black border-b">
                                <span>
                                  মাস
                                </span>

                                <span className="ml-2 font-bold">
                                  {month}
                                </span>
                              </div>

                              <div className="px-2 py-1 border-black border-r border-b">
                                <span>
                                  কায়েদের নাম
                                </span>

                                <span className="ml-2 font-bold">
                                  {kayedInfo.name}
                                </span>
                              </div>

                              <div className="px-2 py-1 border-black border-b">
                                <span>
                                  অর্থবছর
                                </span>

                                <span className="ml-2 font-bold">
                                  {fyStart &&
                                    fyEnd
                                    ? `${fyStart}-${fyEnd}`
                                    : ""}
                                </span>
                              </div>

                              <div className="px-2 py-1 border-black border-r">
                                <span>
                                  মোবাইল নং
                                </span>

                                <span className="ml-2 font-bold">
                                  {toBanglaDigits(
                                    kayedInfo.phone
                                  )}
                                </span>
                              </div>

                              <div className="px-2 py-1">
                                <span>
                                  তারিখ
                                </span>

                                <span className="ml-2 font-bold">
                                  {date}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <div
                      className={`
                        flex
                        flex-col
                        items-center
                        ${isFirstPage
                          ? "mt-5"
                          : "mt-8"
                        }
                        pb-[10mm]
                      `}
                    >
                      {pageSections.length === 0 ? (
                        <div
                          className="py-8 text-stone-500 text-xs text-center"
                          style={tableWidthStyle}
                        >
                          এই রিপোর্টের জন্য কোনো কাঠামো
                          পাওয়া যায়নি।
                        </div>
                      ) : (
                        <div
                          className="flex flex-col gap-7"
                          style={tableWidthStyle}
                        >
                          {pageSections.map(
                            (
                              section,
                              sectionIndex
                            ) => (
                              <div
                                key={
                                  section.id ||
                                  `${section.title}-${sectionIndex}`
                                }
                                className="w-full"
                              >
                                {/*
                                 * Deliberately omit "(পুনরাবৃত্তি)".
                                 *
                                 * When a section continues onto another
                                 * page, its title is still useful, but the
                                 * continuation marker is unnecessary.
                                 */}
                                <div className="mb-1 font-bold text-sm">
                                  {section.title}
                                </div>

                                <div className="border border-black w-full text-xs">
                                  {Array.isArray(
                                    section.rows
                                  ) &&
                                    section.rows.map(
                                      (
                                        row,
                                        rowIndex
                                      ) => {
                                        const fields =
                                          Array.isArray(
                                            row
                                          )
                                            ? row
                                            : [];

                                        if (
                                          fields.length ===
                                          0
                                        ) {
                                          return null;
                                        }

                                        /*
                                         * Column width is fixed for this
                                         * row according to label length.
                                         *
                                         * The row itself cannot break.
                                         */
                                        const weights =
                                          fields.map(
                                            getFieldWeight
                                          );

                                        return (
                                          <div
                                            key={`${section.id || section.title}-row-${rowIndex}`}
                                            className="grid border-black border-b last:border-b-0 divide-x divide-black break-inside-avoid"
                                            style={{
                                              gridTemplateColumns:
                                                weights
                                                  .map(
                                                    (
                                                      weight
                                                    ) =>
                                                      `${weight}fr`
                                                  )
                                                  .join(
                                                    " "
                                                  ),
                                            }}
                                          >
                                            {fields.map(
                                              (
                                                field,
                                                fieldIndex
                                              ) => {
                                                const textarea =
                                                  isTextareaField(
                                                    field
                                                  );

                                                return (
                                                  <div
                                                    key={
                                                      field.id ||
                                                      field.name ||
                                                      `${rowIndex}-${fieldIndex}`
                                                    }
                                                    className={`
                                                      px-2
                                                      py-1.5
                                                      min-h-[26px]
                                                      ${textarea
                                                        ? "flex flex-col justify-start items-start"
                                                        : "flex justify-between items-center gap-1.5"
                                                      }
                                                    `}
                                                  >
                                                    <span className="text-[11px] text-gray-800 leading-tight">
                                                      {
                                                        field.label
                                                      }
                                                    </span>

                                                    <span
                                                      className={`
                                                        font-bold
                                                        text-[12px]
                                                        ${textarea
                                                          ? "mt-1 text-left break-words whitespace-pre-wrap w-full"
                                                          : "whitespace-nowrap"
                                                        }
                                                      `}
                                                    >
                                                      {renderFieldValue(
                                                        field,
                                                        formValues
                                                      )}
                                                    </span>
                                                  </div>
                                                );
                                              }
                                            )}
                                          </div>
                                        );
                                      }
                                    )}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {isLastPage &&
                        formValues.other && (
                          <div
                            className="mt-7 pb-[10mm]"
                            style={tableWidthStyle}
                          >
                            <div className="mb-1 font-bold text-sm">
                              অন্যান্য
                            </div>

                            <div className="block p-2 border border-black min-h-[45px] text-xs whitespace-pre-wrap">
                              {formValues.other}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }
      )}
    </div>
  );
}