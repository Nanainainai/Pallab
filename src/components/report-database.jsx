import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileDown,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { buildPdfDocument, buildPdfFromElements, printPdfSilent } from "../lib/pdfExport";

import HybridInput from "./hybrid-input";
import ReportBoilerplate from "./report-boilerplate";
import Report from "./report";
import { loadJsonDataFile, toBanglaDigits, clone } from "../lib/letterUtils";

const ALL = "সমস্ত";

const getReportKey = (report, index) =>
  report?.filepath ||
  report?.path ||
  report?.filename ||
  report?.id ||
  `report-${index}`;

/* -------------------------------------------------------------------------- */
/* Report metadata                                                            */
/* -------------------------------------------------------------------------- */

const getReportMeta = (report) => {
  const filepath = String(
    report?.filepath ||
    report?.path ||
    ""
  ).replace(/\\/g, "/");

  const parts = filepath.split("/");
  const reportIndex = parts.lastIndexOf("রিপোর্ট");

  const pathStatus =
    reportIndex >= 0
      ? parts[reportIndex + 1] || ""
      : "";

  const pathType =
    reportIndex >= 0
      ? parts[reportIndex + 2] || ""
      : "";

  const pathFiscalYear =
    reportIndex >= 0
      ? parts[reportIndex + 3] || ""
      : "";

  const reach = report?.reach || "";
  const organization = report?.organization || "";
  const jamaat = report?.jamaat || "";

  const status =
    report?.status ||
    report?.reportStatus ||
    pathStatus ||
    "";

  const type =
    report?.type ||
    pathType ||
    "";

  const month = report?.month || "";
  const date = report?.date || "";

  const fyStart =
    report?.["fy-start"] ||
    report?.fyStart ||
    "";

  const fyEnd =
    report?.["fy-end"] ||
    report?.fyEnd ||
    "";

  const fiscalYear =
    fyStart && fyEnd
      ? `${toBanglaDigits(fyStart)}-${toBanglaDigits(fyEnd)}`
      : pathFiscalYear || "";

  return {
    status,
    reach,
    organization,
    jamaat,
    type,
    month,
    date,
    fiscalYear,
    fyStart,
    fyEnd,
    filepath,
  };
};

/* -------------------------------------------------------------------------- */
/* Report preview                                                             */
/* -------------------------------------------------------------------------- */

function ReportPreview({ report, definition, pagesRef }) {
  const containerRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;

    const PAGE_WIDTH_PX = 210 * 3.7795;

    const updateScale = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        setPreviewScale(Math.min(1, containerWidth / PAGE_WIDTH_PX));
      }
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  if (!definition) {
    return (
      <div className="py-8 font-bengali text-gray-500 text-center">
        এই রিপোর্টের কাঠামো report.json-এ পাওয়া যায়নি।
      </div>
    );
  }

  return (
    <div ref={containerRef} className="mt-4 w-full">
      <ReportBoilerplate
        report={definition}
        formValues={report}
        pagesRef={pagesRef}
        previewScale={previewScale}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Filter                                                                      */
/* -------------------------------------------------------------------------- */

function ReportFilter({
  name,
  label,
  value,
  options,
  onChange,
}) {
  return (
    <HybridInput
      label={label}
      name={name}
      title={`${label}: ${value || ""}`}
      autoComplete="off"
      placeholderInitial={label}
      defaultValue={ALL}
      options={options}
      value={value}
      onChange={(event) =>
        onChange(event.target.value)
      }
      className="w-full font-bengali"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function ReportDatabase({
  initialReports = [],
}) {
  const [reports, setReports] = useState(
    Array.isArray(initialReports)
      ? initialReports
      : []
  );

  const [reportDefinitions, setReportDefinitions] =
    useState([]);

  const [editingReport, setEditingReport] = useState(null);

  const [selectedReach, setSelectedReach] =
    useState(ALL);

  const [selectedOrganization, setSelectedOrganization] =
    useState(ALL);

  const [selectedType, setSelectedType] =
    useState(ALL);

  const [selectedFy, setSelectedFy] =
    useState(ALL);

  const [selectedStatus, setSelectedStatus] =
    useState(ALL);

  const [expanded, setExpanded] =
    useState({});

  const pagesRef = useRef({});

  /* ------------------------------------------------------------------------ */
  /* Load database                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [
          savedReports,
          definitions,
        ] = await Promise.all([
          invoke("get_all_reports"),
          loadJsonDataFile(
            "report.json",
            []
          ),
        ]);

        if (!active) return;

        setReports(
          Array.isArray(savedReports)
            ? savedReports
            : []
        );

        setReportDefinitions(
          Array.isArray(definitions)
            ? definitions
            : []
        );
      } catch (error) {
        console.error(
          "Failed to load report database:",
          error
        );

        if (active) {
          setReports(
            Array.isArray(initialReports)
              ? initialReports
              : []
          );
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [initialReports]);

  /* ------------------------------------------------------------------------ */
  /* Normalize metadata                                                       */
  /* ------------------------------------------------------------------------ */

  const reportMeta = useMemo(
    () =>
      reports.map((report, index) => ({
        report,
        meta: getReportMeta(
          report,
          index
        ),
      })),
    [reports]
  );

  /* ------------------------------------------------------------------------ */
  /* Filter options                                                           */
  /* ------------------------------------------------------------------------ */

  const availableStatuses = useMemo(
    () => [
      ALL,
      ...Array.from(
        new Set(
          reportMeta
            .map(({ meta }) => meta.status)
            .filter(Boolean)
        )
      ),
    ],
    [reportMeta]
  );

  const availableReaches = useMemo(
    () => [
      ALL,
      ...Array.from(
        new Set(
          reportMeta
            .map(({ meta }) => meta.reach)
            .filter(Boolean)
        )
      ),
    ],
    [reportMeta]
  );

  const availableOrganizations = useMemo(
    () => [
      ALL,
      ...Array.from(
        new Set(
          reportMeta
            .map(
              ({ meta }) =>
                meta.organization
            )
            .filter(Boolean)
        )
      ),
    ],
    [reportMeta]
  );

  const availableTypes = useMemo(
    () => [
      ALL,
      ...Array.from(
        new Set(
          reportMeta
            .map(({ meta }) => meta.type)
            .filter(Boolean)
        )
      ),
    ],
    [reportMeta]
  );

  const availableFiscalYears = useMemo(
    () => [
      ALL,
      ...Array.from(
        new Set(
          reportMeta
            .map(
              ({ meta }) =>
                meta.fiscalYear
            )
            .filter(Boolean)
        )
      ),
    ],
    [reportMeta]
  );

  /* ------------------------------------------------------------------------ */
  /* Filtering                                                                */
  /* ------------------------------------------------------------------------ */

  const filteredReports = useMemo(
    () =>
      reportMeta.filter(
        ({ meta }) =>
          (
            selectedStatus === ALL ||
            meta.status === selectedStatus
          ) &&
          (
            selectedReach === ALL ||
            meta.reach === selectedReach
          ) &&
          (
            selectedOrganization === ALL ||
            meta.organization ===
            selectedOrganization
          ) &&
          (
            selectedType === ALL ||
            meta.type === selectedType
          ) &&
          (
            selectedFy === ALL ||
            meta.fiscalYear === selectedFy
          )
      ),
    [
      reportMeta,
      selectedStatus,
      selectedReach,
      selectedOrganization,
      selectedType,
      selectedFy,
    ]
  );

  const sortedReports = useMemo(
    () =>
      [...filteredReports].sort(
        (a, b) => {
          const fyCompare =
            String(b.meta.fiscalYear).localeCompare(
              String(a.meta.fiscalYear),
              "bn"
            );

          if (fyCompare !== 0) {
            return fyCompare;
          }

          const dateCompare =
            String(b.meta.date).localeCompare(
              String(a.meta.date),
              "bn"
            );

          if (dateCompare !== 0) {
            return dateCompare;
          }

          return String(
            b.meta.month
          ).localeCompare(
            String(a.meta.month),
            "bn"
          );
        }
      ),
    [filteredReports]
  );

  /* ------------------------------------------------------------------------ */
  /* Definition lookup                                                        */
  /* ------------------------------------------------------------------------ */

  const findDefinition = (report) => {
    return reportDefinitions.find(
      (definition) =>
        definition?.reach ===
        report?.reach &&
        definition?.organization ===
        report?.organization &&
        definition?.type ===
        report?.type
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Expansion                                                                */
  /* ------------------------------------------------------------------------ */

  const toggleExpanded = (report, index) => {
    const key = getReportKey(
      report,
      index
    );

    setExpanded((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  /* ------------------------------------------------------------------------ */
  /* Editor Handlers                                                          */
  /* ------------------------------------------------------------------------ */

  const handleEdit = (
    report,
    event
  ) => {
    event?.preventDefault();
    event?.stopPropagation();

    setEditingReport(clone(report));
  };

  const handleCloseEditor = () => {
    setEditingReport(null);
  };

  /* ------------------------------------------------------------------------ */
  /* Delete                                                                    */
  /* ------------------------------------------------------------------------ */

  const handleDelete = async (
    report,
    event
  ) => {
    event?.preventDefault();
    event?.stopPropagation();

    const filepath =
      report?.filepath ||
      report?.path;

    if (!filepath) {
      alert(
        "রিপোর্টটির file path পাওয়া যায়নি।"
      );
      return;
    }

    const meta = getReportMeta(report);

    const confirmed = window.confirm(
      `"${meta.month || "এই রিপোর্ট"} ${meta.type || "রিপোর্ট"}" স্থায়ীভাবে মুছে ফেলতে চান ? `
    );

    if (!confirmed) return;

    try {
      await invoke(
        "delete_report",
        {
          filepath,
        }
      );

      setReports(
        (previous) =>
          previous.filter(
            (item) =>
              (
                item?.filepath ||
                item?.path
              ) !== filepath
          )
      );

      setExpanded(
        (previous) => {
          const next = {
            ...previous,
          };

          delete next[
            getReportKey(report, 0)
          ];

          return next;
        }
      );
    } catch (error) {
      console.error(
        "Failed to delete report:",
        error
      );

      alert(
        "রিপোর্ট মুছে ফেলা যায়নি।"
      );
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Render pages                                                              */
  /* ------------------------------------------------------------------------ */

  const getPagesForReport = async (
    report,
    index
  ) => {
    const key = getReportKey(
      report,
      index
    );

    if (!expanded[key]) {
      setExpanded(
        (previous) => ({
          ...previous,
          [key]: true,
        })
      );

      await new Promise(
        (resolve) =>
          setTimeout(resolve, 200)
      );
    }

    return (
      pagesRef.current[key] || []
    ).filter(Boolean);
  };

  /* ------------------------------------------------------------------------ */
  /* PDF export                                                                */
  /* ------------------------------------------------------------------------ */

  const exportPdf = async (
    report,
    index
  ) => {
    try {
      const pages =
        await getPagesForReport(
          report,
          index
        );

      if (!pages.length) {
        throw new Error(
          "Rendered report pages not found."
        );
      }

      const pdf = await buildPdfDocument(pages);

      const meta =
        getReportMeta(report);

      const filename = [
        meta.month,
        meta.date
          ? `(${meta.date})`
          : "",
        meta.reach,
        meta.organization,
        meta.type,
        "রিপোর্ট",
      ]
        .filter(Boolean)
        .join(" ");

      pdf.save(
        `${filename || "রিপোর্ট"}.pdf`
      );
    } catch (error) {
      console.error(
        "Report PDF export failed:",
        error
      );
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------ */

  if (editingReport) {
    return (
      <div className="w-full">
        <div className="flex items-center mb-2">
          <button
            type="button"
            title="রিপোর্ট তালিকায় ফিরে যান"
            onClick={handleCloseEditor}
            className="flex justify-center items-center"
          >
            <ChevronDown className="rotate-90" />
          </button>

        </div>

        <Report
          key={
            editingReport.filepath ||
            editingReport.path ||
            editingReport.id ||
            "editing-report"
          }
          initialValues={
            editingReport
          }
        />
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) =>
        event.preventDefault()
      }
      className="w-full"
    >
      <div className="gap-x-2 grid grid-cols-5 mb-4 w-full">
        <ReportFilter
          name="filter-status"
          label="প্রেরিত/প্রাপ্ত"
          value={selectedStatus}
          options={availableStatuses}
          onChange={setSelectedStatus}
        />

        <ReportFilter
          name="filter-reach"
          label="পর্যায়"
          value={selectedReach}
          options={availableReaches}
          onChange={setSelectedReach}
        />

        <ReportFilter
          name="filter-organization"
          label="সংগঠন"
          value={selectedOrganization}
          options={availableOrganizations}
          onChange={setSelectedOrganization}
        />

        <ReportFilter
          name="filter-type"
          label="রিপোর্টের ধরন"
          value={selectedType}
          options={availableTypes}
          onChange={setSelectedType}
        />

        <ReportFilter
          name="filter-fy"
          label="অর্থবছর"
          value={selectedFy}
          options={availableFiscalYears}
          onChange={setSelectedFy}
        />
      </div>

      <div className="separator">
        সংরক্ষিত রিপোর্ট
      </div>

      {sortedReports.length === 0 ? (
        <div className="opacity-70 py-6 font-bengali text-center">
          কোনো রিপোর্ট পাওয়া যায়নি।
        </div>
      ) : (
        <div className="space-y-3">
          {sortedReports.map(
            ({ report, meta }, index) => {
              const key =
                getReportKey(
                  report,
                  index
                );

              const isExpanded =
                !!expanded[key];

              const definition =
                findDefinition(report);

              return (
                <div
                  key={key}
                  className="border-b"
                >
                  <div
                    onClick={() =>
                      toggleExpanded(
                        report,
                        index
                      )
                    }
                    className="group relative hover:bg-black dark:hover:bg-white p-3 hover:text-white dark:hover:text-black transition-colors cursor-none"
                  >
                    <div className="right-2 bottom-2 z-20 absolute flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        title="মুছে ফেলুন"
                        onClick={(event) =>
                          handleDelete(
                            report,
                            event
                          )
                        }
                        className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-6 h-6"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        title={
                          isExpanded
                            ? "সংকুচিত করুন"
                            : "সম্প্রসারিত করুন"
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();

                          toggleExpanded(
                            report,
                            index
                          );
                        }}
                        className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-6 h-6"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        title="সম্পাদনা"
                        onClick={(event) =>
                          handleEdit(
                            report,
                            event
                          )
                        }
                        className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-6 h-6"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {meta.status && (
                          <span className="font-bengali text-xs">
                            {meta.status}
                          </span>
                        )}

                        {meta.organization && (
                          <span className="pl-2 border-current border-l font-bengali font-bold text-xs truncate">
                            {meta.organization}
                          </span>
                        )}

                        {meta.reach && (
                          <span className="opacity-70 pl-2 border-current border-l font-bengali text-xs">
                            {meta.reach}
                          </span>
                        )}
                      </div>

                      {meta.date && (
                        <span className="flex items-center gap-1 opacity-70 font-bengali text-xs">
                          <Calendar className="w-3 h-3" />
                          {meta.date}
                        </span>
                      )}
                    </div>

                    <div className="mb-1 font-bengali font-bold text-base">
                      {meta.month || "রিপোর্ট"}
                    </div>

                    <div className="opacity-70 mb-1 font-bengali text-xs">
                      {[
                        meta.jamaat,
                        meta.type,
                        meta.fiscalYear,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {meta.organization && (
                        <span className="px-1.5 py-0.5 border font-bengali text-xs">
                          {meta.organization}
                        </span>
                      )}

                      {meta.reach && (
                        <span className="px-1.5 py-0.5 border font-bengali text-xs">
                          {meta.reach}
                        </span>
                      )}

                      {meta.jamaat && (
                        <span className="px-1.5 py-0.5 border font-bengali text-xs">
                          {meta.jamaat}
                        </span>
                      )}

                      {meta.type && (
                        <span className="px-1.5 py-0.5 border font-bengali text-xs">
                          {meta.type}
                        </span>
                      )}

                      {meta.status && (
                        <span className="px-1.5 py-0.5 border font-bengali text-xs">
                          {meta.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      onClick={(event) =>
                        event.stopPropagation()
                      }
                      className="my-4 w-full"
                    >
                      <ReportPreview
                        report={report}
                        definition={definition}
                        pagesRef={{
                          current: {
                            [key]:
                              pagesRef.current[
                              key
                              ] || [],
                          },
                        }}
                      />

                      <div className="flex justify-start items-center gap-2 mt-3">
                        <button
                          type="button"
                          title="PDF এক্সপোর্ট"
                          onClick={() =>
                            exportPdf(
                              report,
                              index
                            )
                          }
                          className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-7 h-7"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          title="প্রিন্ট"
                          onClick={async () => {
                            try {
                              const pages =
                                await getPagesForReport(
                                  report,
                                  index
                                );

                              const pdfBase64 =
                                await buildPdfFromElements(
                                  pages
                                );

                              await printPdfSilent(
                                pdfBase64
                              );
                            } catch (error) {
                              console.error(
                                "Report print failed:",
                                error
                              );
                            }
                          }}
                          className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-7 h-7"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          title="সম্পাদনা"
                          onClick={(event) =>
                            handleEdit(
                              report,
                              event
                            )
                          }
                          className="flex justify-center items-center hover:opacity-70 border border-current rounded-full w-7 h-7"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      )}
    </form>
  );
}