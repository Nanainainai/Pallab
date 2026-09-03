import React, { useState, useEffect } from 'react';
import { Pencil, Lock, Save, Trash2, Plus } from 'lucide-react';
import { readTextFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import HybridInput from './hybrid-input';
import { loadJsonDataFile } from '../lib/letterUtils';

const LETTER = "চিঠি";
const REPORT = "রিপোর্ট";

const SPAN_OPTIONS = [
  "এই সপ্তাহের শুক্রবার",
  "এই সপ্তাহের শনিবার",
  "এই সপ্তাহের রবিবার",
  "এই সপ্তাহের সোমবার",
  "এই সপ্তাহের মঙ্গলবার",
  "এই সপ্তাহের বুধবার",
  "এই সপ্তাহেরবৃহস্পতিবার",
  "এই সপ্তাহ",
  "এই মাস",
  "এই বছর",
];

const createEmptyNotification = () => ({
  id: Date.now() + Math.random(),
  span: SPAN_OPTIONS[0],
  document: LETTER,
  reach: '',
  organization: '',
  dafter: '',
  type: '',
  subject: ''
});

const unique = (values) => [
  ...new Set(
    values
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
  ),
];

const getSubjectsForDafter = (templates, dafter) => {
  if (!dafter || !templates) return [];

  const subjects = [];

  const collect = (value) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }

    if (typeof value === "string") {
      subjects.push(value);
      return;
    }

    if (typeof value !== "object") return;

    if (typeof value.subject === "string") {
      subjects.push(value.subject);
    }

    if (Array.isArray(value).subjects) {
      value.subjects.forEach(collect);
    }

    Object.values(value).forEach(collect);
  };

  const findDafter = (value) => {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach(findDafter);
      return;
    }

    Object.entries(value).forEach(([key, child]) => {
      if (key === dafter) {
        collect(child);
      }

      if (child && typeof child === "object") {
        findDafter(child);
      }
    });
  };

  findDafter(templates);

  return unique(subjects);
};

const getAmelaReachData = (amela) => {
  if (!amela || typeof amela !== "object") {
    return {};
  }
  return amela;
};

const getOrganizationsFromAmela = (amela, reach) => {
  const organizations = [];

  if (!amela || typeof amela !== "object") {
    return [];
  }

  const reachEntries = reach
    ? [[reach, amela[reach]]]
    : Object.entries(amela);

  reachEntries.forEach(([, reachData]) => {
    if (!reachData || typeof reachData !== "object") {
      return;
    }

    Object.values(reachData).forEach((jamaatData) => {
      if (!jamaatData || typeof jamaatData !== "object") {
        return;
      }

      Object.keys(jamaatData).forEach((organization) => {
        organizations.push(organization);
      });
    });
  });

  return unique(organizations);
};

const getDaftersFromAmela = (amela, reach, organization) => {
  const dafterValues = [];

  if (!amela || typeof amela !== "object") {
    return [];
  }

  const reachEntries = reach
    ? [[reach, amela[reach]]]
    : Object.entries(amela);

  reachEntries.forEach(([, reachData]) => {
    if (!reachData || typeof reachData !== "object") {
      return;
    }

    Object.values(reachData).forEach((jamaatData) => {
      if (!jamaatData || typeof jamaatData !== "object") {
        return;
      }

      Object.entries(jamaatData).forEach(
        ([organizationName, organizationData]) => {
          if (
            organization &&
            organizationName !== organization
          ) {
            return;
          }

          if (
            !organizationData ||
            typeof organizationData !== "object"
          ) {
            return;
          }

          Object.keys(organizationData).forEach((dafter) => {
            dafterValues.push(dafter);
          });
        }
      );
    });
  });

  return unique(dafterValues);
};

const getReportDefinitions = (reports) => {
  if (!Array.isArray(reports)) {
    return [];
  }

  return reports.filter(
    (report) =>
      report &&
      typeof report === "object"
  );
};

const getReportReach = (report) =>
  report?.reach ||
  report?.পর্যায় ||
  report?.["পর্যায়"] ||
  "";

const getReportOrganization = (report) =>
  report?.organization ||
  report?.সংগঠন ||
  report?.["সংগঠন"] ||
  "";

const getReportType = (report) =>
  report?.type ||
  report?.reportType ||
  report?.letterType ||
  report?.["রিপোর্টের ধরন"] ||
  "";

const getReportDafter = (report) => {
  const dafter = report?.dafter;

  if (Array.isArray(dafter)) {
    return dafter;
  }

  if (typeof dafter === "string") {
    return [dafter];
  }

  return [];
};

const getReportReachOptions = (reports) =>
  unique(reports.map(getReportReach));

const getReportOrganizationOptions = (reports, reach) =>
  unique(
    reports
      .filter(
        (report) =>
          !reach ||
          getReportReach(report) === reach
      )
      .map(getReportOrganization)
  );

const getReportTypeOptions = (reports, reach, organization) =>
  unique(
    reports
      .filter(
        (report) =>
          (!reach ||
            getReportReach(report) === reach) &&
          (!organization ||
            getReportOrganization(report) ===
            organization)
      )
      .map(getReportType)
  );

const getReportDafterOptionsForSelection = (reports, reach, organization) =>
  unique(
    reports
      .filter(
        (report) =>
          (!reach ||
            getReportReach(report) === reach) &&
          (!organization ||
            getReportOrganization(report) ===
            organization)
      )
      .flatMap(getReportDafter)
  );

export default function NotificationEditor() {
  const [notifications, setNotifications] = useState([]);
  const [isEditable, setIsEditable] = useState(false);

  // Dynamic filter state
  const [filterReach, setFilterReach] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [filterDoc, setFilterDoc] = useState('');
  const [filterSpan, setFilterSpan] = useState('');
  const [filterDafter, setFilterDafter] = useState('');
  const [filterSubject, setFilterSubject] = useState('');

  // New items state
  const [newNotifications, setNewNotifications] = useState([createEmptyNotification()]);

  const [reportDefinitions, setReportDefinitions] = useState([]);
  const [amelaData, setAmelaData] = useState({});
  const [templatesData, setTemplatesData] = useState({});

  const loadNotificationData = async () => {
    try {
      const [
        parsedNotifications,
        reports,
        amela,
        templates,
      ] = await Promise.all([
        loadJsonDataFile('notification.json', []),
        loadJsonDataFile('report.json', []),
        loadJsonDataFile('amela.json', {}),
        loadJsonDataFile('templates.json', {}),
      ]);

      setNotifications(Array.isArray(parsedNotifications) ? parsedNotifications : []);
      setReportDefinitions(getReportDefinitions(reports));
      setAmelaData(getAmelaReachData(amela));
      setTemplatesData(templates && typeof templates === 'object' ? templates : {});
    } catch (err) {
      console.error('Failed to load notification datasets:', err);
    }
  };

  useEffect(() => {
    loadNotificationData();
  }, []);

  const filterReachOpts = unique([
    ...notifications.map((n) => n.reach),
    ...Object.keys(amelaData),
    ...getReportReachOptions(reportDefinitions)
  ]);

  const filterOrgOpts = unique([
    ...notifications.map((n) => n.organization),
    ...getOrganizationsFromAmela(amelaData, filterReach),
    ...getReportOrganizationOptions(reportDefinitions, filterReach)
  ]);

  const filterDocOpts = unique([LETTER, REPORT, ...notifications.map((n) => n.document)]);

  const filterSpanOpts = unique([
    ...SPAN_OPTIONS,
    ...notifications.map((n) => n.span)
  ]);

  const filterDafterOpts = unique([
    ...notifications.map((n) => n.dafter),
    ...getDaftersFromAmela(amelaData, filterReach, filterOrg),
    ...getReportDafterOptionsForSelection(reportDefinitions, filterReach, filterOrg)
  ]);

  const filterSubjectOpts = unique([
    ...notifications.map((n) => n.subject),
    ...(filterDafter ? getSubjectsForDafter(templatesData, filterDafter) : [])
  ]);

  const getFilteredNotifications = () => {
    return notifications.filter((n) => {
      if (filterReach && n.reach !== filterReach) return false;
      if (filterOrg && n.organization !== filterOrg) return false;
      if (filterDoc && n.document !== filterDoc) return false;
      if (filterSpan && n.span !== filterSpan) return false;
      if (filterDafter && n.dafter !== filterDafter) return false;
      if (filterSubject && filterDoc === LETTER && n.subject !== filterSubject) return false;
      return true;
    });
  };

  const handleToggleEdit = () => {
    setIsEditable((prev) => !prev);
  };

  const handleFieldChange = (id, field, val) => {
    if (!isEditable) return;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const updated = { ...n, [field]: val };

        if (field === 'document' || field === 'reach') {
          updated.organization = '';
          updated.dafter = '';
          updated.subject = '';
        } else if (field === 'organization') {
          updated.dafter = '';
          updated.subject = '';
        }

        return updated;
      })
    );
  };

  const handleRemoveExistingNotification = (id) => {
    if (!isEditable) return;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleAddNewNotificationField = () => {
    setNewNotifications((prev) => [...prev, createEmptyNotification()]);
  };

  const handleNewNotificationChange = (id, field, val) => {
    setNewNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const updated = { ...n, [field]: val };

        if (field === 'document' || field === 'reach') {
          updated.organization = '';
          updated.dafter = '';
          updated.subject = '';
        } else if (field === 'organization') {
          updated.dafter = '';
          updated.subject = '';
        }

        return updated;
      })
    );
  };

  const handleRemoveNewNotificationField = (id) => {
    setNewNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const getOptionsForNotification = (item) => {
    const isReport = item.document === REPORT;

    const reachOpts = isReport
      ? getReportReachOptions(reportDefinitions)
      : unique(Object.keys(amelaData));

    const orgOpts = isReport
      ? getReportOrganizationOptions(reportDefinitions, item.reach)
      : getOrganizationsFromAmela(amelaData, item.reach);

    let dafterOpts = [];
    if (isReport) {
      const rDafters = getReportDafterOptionsForSelection(
        reportDefinitions,
        item.reach,
        item.organization
      );
      const rTypes = getReportTypeOptions(
        reportDefinitions,
        item.reach,
        item.organization
      );
      dafterOpts = unique([...rDafters, ...rTypes]);
    } else {
      dafterOpts = getDaftersFromAmela(
        amelaData,
        item.reach,
        item.organization
      );
    }

    const subjectOpts =
      !isReport && item.dafter
        ? getSubjectsForDafter(templatesData, item.dafter)
        : [];

    return { reachOpts, orgOpts, dafterOpts, subjectOpts };
  };

  const handleSave = async () => {
    try {
      const combined = [...notifications, ...newNotifications]
        .map((n) => ({
          ...n,
          span: n.span || SPAN_OPTIONS[0],
          document: n.document || LETTER,
          reach: n.reach || '',
          organization: n.organization || '',
          dafter: n.dafter || '',
          type: n.type || '',
          subject: n.document === REPORT ? '' : n.subject || '',
        }))
        .filter((n) => n.document && n.reach && n.organization && n.dafter);

      await writeTextFile(
        'Pallab/data/notification.json',
        JSON.stringify(combined, null, 2),
        { baseDir: BaseDirectory.Document }
      );

      setNotifications(combined);
      setNewNotifications([createEmptyNotification()]);
      setIsEditable(false);
      alert('Notification dataset updated successfully!');
    } catch (err) {
      console.error('Failed to save notification.json:', err);
      alert('Failed to save changes: ' + err);
    }
  };

  const handleDiscard = () => {
    loadNotificationData();
    setNewNotifications([createEmptyNotification()]);
  };

  const activeNotifications = getFilteredNotifications();

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-wrap gap-2 w-full">
        <HybridInput
          name="filter-reach"
          label="পর্যায়"
          wrapperClassName="flex-1 min-w-30"
          title="পর্যায় ফিল্টার"
          autoComplete="off"
          placeholderInitial="সকল পর্যায়"
          defaultValue="স্থানীয়"
          options={filterReachOpts}
          value={filterReach}
          onChange={(e) => setFilterReach(e.target.value)}
          className="w-full font-bengali"
        />

        <HybridInput
          name="filter-organization"
          label="সংগঠন"
          wrapperClassName="flex-1 min-w-35"
          title="সংগঠন ফিল্টার"
          autoComplete="off"
          placeholderInitial="সকল সংগঠন"
          defaultValue="মজলিস খোদ্দামুল আহমদীয়া"
          options={filterOrgOpts}
          value={filterOrg}
          onChange={(e) => setFilterOrg(e.target.value)}
          className="w-full font-bengali"
        />

        <HybridInput
          name="filter-document"
          label="চিঠি/রিপোর্ট"
          wrapperClassName="flex-1 min-w-30"
          title="চিঠি/রিপোর্ট ফিল্টার"
          autoComplete="off"
          placeholderInitial="সকল ধরন"
          defaultValue={LETTER}
          options={filterDocOpts}
          value={filterDoc}
          onChange={(e) => setFilterDoc(e.target.value)}
          className="w-full font-bengali"
        />

        <HybridInput
          name="filter-span"
          label="সময়সীমা"
          wrapperClassName="flex-1 min-w-30"
          title="সময়সীমা ফিল্টার"
          autoComplete="off"
          placeholderInitial="সকল সময়সীমা"
          defaultValue={SPAN_OPTIONS[0]}
          options={filterSpanOpts}
          value={filterSpan}
          onChange={(e) => setFilterSpan(e.target.value)}
          className="w-full font-bengali"
        />

        <HybridInput
          name="filter-dafter"
          label={filterDoc === REPORT ? "ধরন" : filterDoc === LETTER ? "দপ্তর" : "দপ্তর/ধরন"}
          wrapperClassName="flex-1 min-w-30"
          title={filterDoc === REPORT ? "ধরন ফিল্টার" : "দপ্তর ফিল্টার"}
          autoComplete="off"
          placeholderInitial={filterDoc === REPORT ? "সকল ধরন" : "সকল দপ্তর"}
          defaultValue={filterDoc === REPORT ? "মাসিক" : "সাধারণ"}
          options={filterDafterOpts}
          value={filterDafter}
          onChange={(e) => setFilterDafter(e.target.value)}
          className="w-full font-bengali"
        />

        {filterDoc !== REPORT && (
          <HybridInput
            name="filter-subject"
            label="বিষয়"
            wrapperClassName="flex-1 min-w-35"
            title="বিষয় ফিল্টার"
            autoComplete="off"
            placeholderInitial="সকল বিষয়"
            defaultValue="সাধারণ বিষয়"
            options={filterSubjectOpts}
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="w-full font-bengali"
          />
        )}
      </div>

      <div className="separator">নোটিফিকেশনসমূহ</div>

      {isEditable && (
        <div className="mb-6 pb-4 border-stone-200 border-b">
          <span className="font-bengali font-semibold text-md">
            নতুন নোটিফিকেশন যোগ করুন
          </span>
          {newNotifications.map((nm) => {
            const { reachOpts, orgOpts, dafterOpts, subjectOpts } =
              getOptionsForNotification(nm);
            const isReport = nm.document === REPORT;
            const dynamicLabel = isReport ? "ধরন" : "দপ্তর";

            return (
              <div key={nm.id} className="mb-4 last:border-0">
                <div className="gap-2 grid grid-cols-2">
                  <HybridInput
                    label="সময়সীমা"
                    name={`new-span-${nm.id}`}
                    title="সময়সীমা"
                    placeholderInitial="সময়সীমা"
                    defaultValue={SPAN_OPTIONS[0]}
                    options={SPAN_OPTIONS}
                    value={nm.span}
                    autoComplete="off"
                    onChange={(e) =>
                      handleNewNotificationChange(nm.id, 'span', e.target.value)
                    }
                    className="w-full font-bengali"
                  />

                  <HybridInput
                    label="চিঠি/রিপোর্ট"
                    name={`new-doc-${nm.id}`}
                    title="চিঠি/রিপোর্ট"
                    placeholderInitial="চিঠি/রিপোর্ট"
                    defaultValue={LETTER}
                    options={[LETTER, REPORT]}
                    value={nm.document}
                    autoComplete="off"
                    onChange={(e) =>
                      handleNewNotificationChange(nm.id, 'document', e.target.value)
                    }
                    className="w-full font-bengali"
                  />
                </div>

                <div className="flex flex-wrap gap-2 mt-2 w-full">
                  <HybridInput
                    label="পর্যায়"
                    wrapperClassName="flex-1 min-w-30"
                    name={`new-reach-${nm.id}`}
                    title="পর্যায়"
                    placeholderInitial="পর্যায়"
                    defaultValue="স্থানীয়"
                    options={reachOpts}
                    value={nm.reach}
                    autoComplete="off"
                    onChange={(e) =>
                      handleNewNotificationChange(nm.id, 'reach', e.target.value)
                    }
                    className="w-full font-bengali"
                  />

                  <HybridInput
                    label="সংগঠন"
                    wrapperClassName="flex-1 min-w-35"
                    name={`new-org-${nm.id}`}
                    title="সংগঠন"
                    placeholderInitial="সংগঠন"
                    defaultValue="মজলিস খোদ্দামুল আহমদীয়া"
                    options={orgOpts}
                    value={nm.organization}
                    autoComplete="off"
                    onChange={(e) =>
                      handleNewNotificationChange(nm.id, 'organization', e.target.value)
                    }
                    className="w-full font-bengali"
                  />

                  <HybridInput
                    label={dynamicLabel}
                    wrapperClassName="flex-1 min-w-30"
                    name={`new-dafter-${nm.id}`}
                    title={dynamicLabel}
                    placeholderInitial={dynamicLabel}
                    defaultValue={isReport ? "মাসিক" : "সাধারণ"}
                    options={dafterOpts}
                    value={nm.dafter}
                    autoComplete="off"
                    onChange={(e) =>
                      handleNewNotificationChange(nm.id, 'dafter', e.target.value)
                    }
                    className="w-full font-bengali"
                  />

                  {!isReport && (
                    <HybridInput
                      label="বিষয়"
                      wrapperClassName="flex-1 min-w-35"
                      name={`new-subject-${nm.id}`}
                      title="বিষয়"
                      placeholderInitial="বিষয়"
                      defaultValue="সাধারণ বিষয়"
                      options={subjectOpts}
                      value={nm.subject}
                      autoComplete="off"
                      onChange={(e) =>
                        handleNewNotificationChange(nm.id, 'subject', e.target.value)
                      }
                      className="w-full font-bengali"
                    />
                  )}
                </div>

                <div className="flex justify-between items-center mt-1 mb-2">
                  {newNotifications.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveNewNotificationField(nm.id)}
                      title="Remove Field"
                    >
                      <Trash2 />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddNewNotificationField}
            className="w-full"
            title="আরো নোটিফিকেশন যোগ করুন"
          >
            <Plus />
          </button>
        </div>
      )}

      {activeNotifications.length === 0 ? (
        <div className="py-4 font-bengali text-stone-500 text-center">
          কোনো নোটিফিকেশন পাওয়া যায়নি।
        </div>
      ) : (
        activeNotifications.map((m) => {
          const { reachOpts, orgOpts, dafterOpts, subjectOpts } =
            getOptionsForNotification(m);
          const isReport = m.document === REPORT;
          const dynamicLabel = isReport ? "ধরন" : "দপ্তর";

          return (
            <div key={m.id} className="mb-4">
              <div className="flex justify-between items-center">
                <div className="font-bengali font-bold text-md">
                  {m.document}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 w-full">
                <HybridInput
                  label="সময়সীমা"
                  wrapperClassName="flex-1 min-w-30"
                  name={`span-${m.id}`}
                  title="সময়সীমা"
                  placeholderInitial="সময়সীমা"
                  defaultValue={SPAN_OPTIONS[0]}
                  options={SPAN_OPTIONS}
                  value={m.span || ''}
                  readOnly={!isEditable}
                  onChange={(e) => handleFieldChange(m.id, 'span', e.target.value)}
                  className="w-full font-bengali"
                />

                <HybridInput
                  label="পর্যায়"
                  wrapperClassName="flex-1 min-w-30"
                  name={`reach-${m.id}`}
                  title="পর্যায়"
                  placeholderInitial="পর্যায়"
                  defaultValue="স্থানীয়"
                  options={reachOpts}
                  value={m.reach || ''}
                  readOnly={!isEditable}
                  onChange={(e) => handleFieldChange(m.id, 'reach', e.target.value)}
                  className="w-full font-bengali"
                />

                <HybridInput
                  label="সংগঠন"
                  wrapperClassName="flex-1 min-w-35"
                  name={`organization-${m.id}`}
                  title="সংগঠন"
                  placeholderInitial="সংগঠন"
                  defaultValue="মজলিস খোদ্দামুল আহমদীয়া"
                  options={orgOpts}
                  value={m.organization || ''}
                  readOnly={!isEditable}
                  onChange={(e) => handleFieldChange(m.id, 'organization', e.target.value)}
                  className="w-full font-bengali"
                />

                <HybridInput
                  label={dynamicLabel}
                  wrapperClassName="flex-1 min-w-30"
                  name={`dafter-${m.id}`}
                  title={dynamicLabel}
                  placeholderInitial={dynamicLabel}
                  defaultValue={isReport ? "মাসিক" : "সাধারণ"}
                  options={dafterOpts}
                  value={m.dafter || ''}
                  readOnly={!isEditable}
                  onChange={(e) => handleFieldChange(m.id, 'dafter', e.target.value)}
                  className="w-full font-bengali"
                />

                {!isReport && (
                  <HybridInput
                    label="বিষয়"
                    wrapperClassName="flex-1 min-w-35"
                    name={`subject-${m.id}`}
                    title="বিষয়"
                    placeholderInitial="বিষয়"
                    defaultValue="সাধারণ বিষয়"
                    options={subjectOpts}
                    value={m.subject || ''}
                    readOnly={!isEditable}
                    onChange={(e) => handleFieldChange(m.id, 'subject', e.target.value)}
                    className="w-full font-bengali"
                  />
                )}
              </div>

              {isEditable && (
                <button
                  type="button"
                  title="নোটিফিকেশন মুছে ফেলুন"
                  onClick={() => handleRemoveExistingNotification(m.id)}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          );
        })
      )}

      <div className="absolute flex justify-end gap-0.5">
        <button
          type="button"
          onClick={handleToggleEdit}
          title={isEditable ? "দর্শন মোড" : "পরিবর্তন মোড"}
        >
          {isEditable ? <Lock /> : <Pencil />}
        </button>
        {isEditable && (
          <>
            <button
              type="button"
              onClick={handleDiscard}
              title="অপরিবর্তিত রাখুন"
            >
              <Trash2 />
            </button>
            <button
              type="button"
              onClick={handleSave}
              title="পরিবর্তন সংরক্ষণ করুন"
            >
              <Save />
            </button>
          </>
        )}
      </div>
    </form>
  );
}