import React, { useState, useEffect } from 'react';
import { Pencil, Lock, Save, Trash2, Plus } from 'lucide-react';
import { writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import HybridInput, { renderStandardInput } from './hybrid-input';
import { loadJsonDataFile, saveJsonDataFile, clone } from '../lib/letterUtils';

// Helper to look up which dafter a title/designation belongs to in existing amela tree
const findDafterForTitle = (tree, title) => {
  if (!tree || typeof tree !== 'object' || !title) return null;

  for (const reachKey in tree) {
    const reachObj = tree[reachKey];
    for (const jamaatKey in reachObj) {
      const jamaatObj = reachObj[jamaatKey];
      for (const orgKey in jamaatObj) {
        const orgObj = jamaatObj[orgKey];
        if (orgObj && typeof orgObj === 'object') {
          // If the orgObj contains fields/sub-levels or direct dafters
          for (const k in orgObj) {
            const val = orgObj[k];
            // Check if k is a dafter containing title, or if it's a field level container
            if (val && typeof val === 'object') {
              if (title in val) {
                return k;
              }
              // Check one level deeper if "dafter khetro" is structured as a nesting key
              for (const subKey in val) {
                const subVal = val[subKey];
                if (subVal && typeof subVal === 'object' && title in subVal) {
                  return subKey;
                }
              }
            }
          }
        }
      }
    }
  }
  return null;
};

// Traverses full amela dataset to extract every unique title designation
const extractAllTitles = (tree) => {
  const titles = new Set();
  if (!tree || typeof tree !== 'object') return [];

  for (const reachKey in tree) {
    const reachObj = tree[reachKey];
    for (const jamaatKey in reachObj) {
      const jamaatObj = reachObj[jamaatKey];
      for (const orgKey in jamaatObj) {
        const orgObj = jamaatObj[orgKey];
        if (orgObj && typeof orgObj === 'object') {
          for (const k in orgObj) {
            const val = orgObj[k];
            if (val && typeof val === 'object') {
              // Check if val has titles directly or inside sub-keys (khetro)
              for (const subKey in val) {
                const subVal = val[subKey];
                if (subVal && typeof subVal === 'object') {
                  // Could be a dafter or a khetro
                  for (const innerKey in subVal) {
                    const innerVal = subVal[innerKey];
                    if (innerVal && typeof innerVal === 'object' && !('name' in innerVal || 'phone' in innerVal)) {
                      // It's a title map
                      if (innerKey && innerKey.trim()) titles.add(innerKey.trim());
                    } else if (innerKey && innerKey.trim() && (innerVal?.name || innerVal?.phone || innerVal?.email)) {
                      titles.add(innerKey.trim());
                    }
                  }
                  if (subKey && subKey.trim() && !DAFTER_ORDER_INCLUDES(subKey) && subVal?.name) {
                    // direct title check
                  }
                }
              }
              // Standard traversal
              if (titleKeyInObject(val)) {
                // handled below
              }
            }
          }
        }
      }
    }
  }
  return Array.from(titles);
};

const DAFTER_ORDER = [
  "সদর",
  "তাজনীদ",
  "এতেমাদ",
  "তরবিয়ত",
  "নও মোবাঈন",
  "রিশতানাতা",
  "তাবলীগ",
  "তালীম",
  "ওয়াকারে আমল",
  "মাল",
  "তাহরিকে জাদীদ",
  "ওয়াকফে জাদীদ",
  "সানাত এ তেজারাত",
  "উমুরে তোলাবা",
  "খেদমতে খালক",
  "সেহতে জিসমানী",
  "ইশায়াত",
  "আতফাল",
  "উমুমী",
  "ওয়াকফে নও",
  "মোহাসেব"
];

const DAFTER_ORDER_INCLUDES = (key) => DAFTER_ORDER.includes(key);

const titleKeyInObject = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  return Object.values(obj).some(v => v && typeof v === 'object' && ('name' in v || 'phone' in v || 'email' in v));
};

const createEmptyMember = () => ({
  id: Date.now() + Math.random(),
  dafter: '',
  title: '',
  name: '',
  email: '',
  phone: '',
  whatsapp: ''
});

export default function AmelaViewAndEdit() {
  const [data, setData] = useState({});
  const [isEditable, setIsEditable] = useState(false);

  // Filter state including selectedField (দপ্তর ক্ষেত্র)
  const [selectedReach, setSelectedReach] = useState('');
  const [selectedJamaat, setSelectedJamaat] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedField, setSelectedField] = useState('নেই');

  // Start with 1 empty member form by default
  const [newMembers, setNewMembers] = useState([createEmptyMember()]);

  // Read amela.json dynamically from application directory
  const loadAmelaData = async () => {
    const parsed = await loadJsonDataFile('amela.json', {});
    setData(parsed);
  };

  useEffect(() => {
    loadAmelaData();
  }, []);

  const reachOptions = Object.keys(data || {});

  const jamaatOptions = selectedReach && data[selectedReach]
    ? Object.keys(data[selectedReach])
    : [];

  const getDeptOptions = () => {
    if (!selectedReach || !selectedJamaat) return [];
    const jamaatObj = data[selectedReach]?.[selectedJamaat];
    return jamaatObj ? Object.keys(jamaatObj) : [];
  };

  const deptOptions = getDeptOptions();

  const getFieldOptions = () => {
    if (!selectedReach || !selectedJamaat || !selectedDept) return ["নেই"];
    const deptObj = data[selectedReach]?.[selectedJamaat]?.[selectedDept];
    if (!deptObj) return ["নেই"];
    
    // Extract keys that act as fields vs dafters
    const keys = Object.keys(deptObj);
    const fields = keys.filter(k => !DAFTER_ORDER.includes(k));
    return ["নেই", ...fields.filter(f => f !== "নেই")];
  };

  const fieldOptions = getFieldOptions();

  useEffect(() => {
    if (reachOptions.length > 0 && !selectedReach) {
      setSelectedReach(reachOptions[0]);
    }
  }, [data]);

  useEffect(() => {
    if (jamaatOptions.length > 0) {
      setSelectedJamaat(jamaatOptions[0]);
    } else {
      setSelectedJamaat('');
    }
  }, [selectedReach]);

  useEffect(() => {
    if (deptOptions.length > 0) {
      setSelectedDept(deptOptions[0]);
    } else {
      setSelectedDept('');
    }
  }, [selectedJamaat]);

  useEffect(() => {
    const opts = getFieldOptions();
    if (opts.includes(selectedField)) {
      // keep current if valid
    } else {
      setSelectedField(opts[0] || "নেই");
    }
  }, [selectedDept]);

  const titleRank = (title) => {
    if (title.includes("সহকারী")) return 3;
    if (title.includes("এডিশনাল")) return 2;
    if (title.includes("নায়েব")) return 1;
    return 0;
  };

  const getActiveMembers = () => {
    if (!selectedReach || !selectedJamaat || !selectedDept) return [];

    const deptObj = data[selectedReach]?.[selectedJamaat]?.[selectedDept];
    if (!deptObj) return [];

    let targetContainer = deptObj;
    if (selectedField && selectedField !== "নেই" && deptObj[selectedField]) {
      targetContainer = deptObj[selectedField];
    }

    return Object.entries(targetContainer)
      .filter(([key]) => DAFTER_ORDER.includes(key) || !fieldOptions.includes(key))
      .sort(([a], [b]) => {
        const ia = DAFTER_ORDER.indexOf(a);
        const ib = DAFTER_ORDER.indexOf(b);

        if (ia === -1 && ib === -1) return a.localeCompare(b, "bn");
        if (ia === -1) return 1;
        if (ib === -1) return -1;

        return ia - ib;
      })
      .flatMap(([dafterName, members]) => {
        if (!members || typeof members !== 'object') return [];
        return Object.entries(members)
          .sort(([titleA], [titleB]) => {
            const ra = titleRank(titleA);
            const rb = titleRank(titleB);

            if (ra !== rb) return ra - rb;

            return titleA.localeCompare(titleB, "bn");
          })
          .map(([designation, info]) => ({
            designation,
            dafter: dafterName,
            ...info,
          }));
      });
  };

  const handleFieldChange = (designation, dafter, field, val) => {
    if (!isEditable) return;
    const updated = clone(data);

    if (!updated[selectedReach]) updated[selectedReach] = {};
    if (!updated[selectedReach][selectedJamaat]) updated[selectedReach][selectedJamaat] = {};
    if (!updated[selectedReach][selectedJamaat][selectedDept]) {
      updated[selectedReach][selectedJamaat][selectedDept] = {};
    }

    let targetContainer = updated[selectedReach][selectedJamaat][selectedDept];
    if (selectedField && selectedField !== "নেই") {
      if (!targetContainer[selectedField]) targetContainer[selectedField] = {};
      targetContainer = targetContainer[selectedField];
    }

    const targetDafter = dafter || findDafterForTitle(data, designation) || 'সাধারণ';

    if (!targetContainer[targetDafter]) targetContainer[targetDafter] = {};
    if (!targetContainer[targetDafter][designation]) {
      targetContainer[targetDafter][designation] = { name: '', phone: '', email: '', whatsapp: '' };
    }

    targetContainer[targetDafter][designation][field] = val;
    setData(updated);
  };

  const handleRemoveExistingMember = (designation, dafter) => {
    if (!isEditable) return;

    const updated = clone(data);
    let targetContainer = updated[selectedReach]?.[selectedJamaat]?.[selectedDept];

    if (!targetContainer) return;
    if (selectedField && selectedField !== "নেই" && targetContainer[selectedField]) {
      targetContainer = targetContainer[selectedField];
    }

    if (!targetContainer?.[dafter]) return;

    delete targetContainer[dafter][designation];

    if (Object.keys(targetContainer[dafter]).length === 0) {
      delete targetContainer[dafter];
    }

    setData(updated);
  };

  const handleAddNewMemberField = () => {
    setNewMembers((prev) => [...prev, createEmptyMember()]);
  };

  const handleNewMemberChange = (id, field, val) => {
    setNewMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: val } : m))
    );
  };

  const handleRemoveNewMemberField = (id) => {
    setNewMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleToggleEdit = () => {
    setIsEditable((prev) => !prev);
  };

  const syncTitlesJson = async (updatedData) => {
    try {
      const titlesMap = await loadJsonDataFile('titles.json', {});
      const allTitles = extractAllTitles(updatedData);

      let maxId = -1;
      Object.values(titlesMap).forEach((id) => {
        if (typeof id === 'number' && id > maxId) {
          maxId = id;
        }
      });

      let changed = false;
      allTitles.forEach((title) => {
        if (!(title in titlesMap)) {
          maxId += 1;
          titlesMap[title] = maxId;
          changed = true;
        }
      });

      if (changed) {
        await writeTextFile('Pallab/data/titles.json', JSON.stringify(titlesMap, null, 2), {
          baseDir: BaseDirectory.Document,
        });
      }
    } catch (err) {
      console.error('Failed to sync titles.json:', err);
    }
  };

  const handleSave = async () => {
    const updated = clone(data);

    newMembers.forEach((nm) => {
      if (!nm.title.trim() || !selectedReach.trim() || !selectedJamaat.trim() || !selectedDept.trim()) {
        return;
      }

      const dafterName = nm.dafter.trim() || findDafterForTitle(data, nm.title) || 'সাধারণ';

      if (!updated[selectedReach]) updated[selectedReach] = {};
      if (!updated[selectedReach][selectedJamaat]) updated[selectedReach][selectedJamaat] = {};
      if (!updated[selectedReach][selectedJamaat][selectedDept]) {
        updated[selectedReach][selectedJamaat][selectedDept] = {};
      }

      let targetContainer = updated[selectedReach][selectedJamaat][selectedDept];
      if (selectedField && selectedField !== "নেই") {
        if (!targetContainer[selectedField]) targetContainer[selectedField] = {};
        targetContainer = targetContainer[selectedField];
      }

      if (!targetContainer[dafterName]) targetContainer[dafterName] = {};

      targetContainer[dafterName][nm.title] = {
        name: nm.name,
        email: nm.email,
        phone: nm.phone,
        whatsapp: nm.whatsapp,
      };
    });

    try {
      await syncTitlesJson(updated);
      await saveJsonDataFile({
        invokeCommand: 'save_amela',
        invokeArgKey: 'amelaData',
        data: updated,
        fileName: 'amela.json',
      });
      setData(updated);
      setNewMembers([createEmptyMember()]);
      alert('Amela dataset updated successfully!');
    } catch (err) {
      console.error('Failed to write file to disk:', err);
      alert('Failed to save changes to file: ' + err);
    }
  };

  const handleDiscard = () => {
    loadAmelaData();
    setNewMembers([createEmptyMember()]);
  };

  const groupedMembers = getActiveMembers().reduce((acc, member) => {
    if (!acc[member.dafter]) {
      acc[member.dafter] = [];
    }

    acc[member.dafter].push(member);

    return acc;
  }, {});

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div className="gap-x-2 grid grid-cols-4 w-full mb-4">
        <HybridInput
          label="পর্যায়"
          name="reach"
          title="পর্যায়"
          autoComplete="off"
          placeholderInitial="পর্যায়"
          defaultValue="স্থানীয়"
          options={reachOptions}
          value={selectedReach}
          onChange={(e) => setSelectedReach(e.target.value)}
          className="w-full font-bengali"
        />
        <HybridInput
          label="জামা'ত"
          name="jamaat"
          title="জামা'ত"
          autoComplete="off"
          placeholderInitial="জামা'ত"
          defaultValue="নারায়ণগঞ্জ"
          options={jamaatOptions}
          value={selectedJamaat}
          onChange={(e) => setSelectedJamaat(e.target.value)}
          className="w-full font-bengali"
        />
        <HybridInput
          label="সংগঠন"
          name="department"
          title='সংগঠন'
          autoComplete="off"
          placeholderInitial="সংগঠন"
          defaultValue="মজলিস খোদ্দামুল আহমদীয়া"
          options={deptOptions}
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="w-full font-bengali"
        />
        <HybridInput
          label="দপ্তর ক্ষেত্র"
          name="field"
          title="দপ্তর ক্ষেত্র"
          autoComplete="off"
          placeholderInitial="দপ্তর ক্ষেত্র"
          defaultValue="নেই"
          options={fieldOptions}
          value={selectedField}
          onChange={(e) => setSelectedField(e.target.value)}
          className="w-full font-bengali"
        />
      </div>

      <div className="separator">আমেলা সদস্যবৃন্দ</div>

      {isEditable && (
        <div className="mb-6 pb-4 border-stone-200 border-b">
          <span className="font-bengali font-semibold text-md">
            নতুন সদস্য যোগ করুন
          </span>
          {newMembers.map((nm) => {
            return (
              <div key={nm.id} className="mb-4 last:border-0">
                <div className="gap-2 grid grid-cols-2">
                  <HybridInput
                    label="দপ্তর"
                    name={`new-dafter-${nm.id}`}
                    title="দপ্তর"
                    placeholderInitial="দপ্তর"
                    defaultValue={DAFTER_ORDER[2] ?? ""}
                    options={DAFTER_ORDER}
                    value={nm.dafter}
                    autoComplete="off"
                    onChange={(e) => handleNewMemberChange(nm.id, "dafter", e.target.value)}
                    className="w-full font-bengali"
                  />
                  {renderStandardInput(
                    `new-title-${nm.id}`,
                    "পদবী",
                    nm.title,
                    (e) => handleNewMemberChange(nm.id, 'title', e.target.value),
                    { className: "w-full font-bengali" }
                  )}
                </div>

                <div className="flex flex-wrap gap-2 w-full mt-2">
                  {renderStandardInput(
                    `new-name-${nm.id}`,
                    "নাম",
                    nm.name,
                    (e) => handleNewMemberChange(nm.id, 'name', e.target.value),
                    { wrapperClassName: "flex-1 min-w-35", className: "w-full font-bengali" }
                  )}
                  {renderStandardInput(
                    `new-email-${nm.id}`,
                    "ইমেইল",
                    nm.email,
                    (e) => handleNewMemberChange(nm.id, 'email', e.target.value),
                    { wrapperClassName: "flex-1 min-w-30", type: "email", className: "w-full font-bengali" }
                  )}
                  {renderStandardInput(
                    `new-phone-${nm.id}`,
                    "মোবাইল",
                    nm.phone,
                    (e) => handleNewMemberChange(nm.id, 'phone', e.target.value),
                    { wrapperClassName: "flex-1 min-w-30", className: "w-full font-bengali" }
                  )}
                  {renderStandardInput(
                    `new-whatsapp-${nm.id}`,
                    "হোয়াটসঅ্যাপ",
                    nm.whatsapp,
                    (e) => handleNewMemberChange(nm.id, 'whatsapp', e.target.value),
                    { wrapperClassName: "flex-1 min-w-25", className: "w-full font-bengali" }
                  )}
                </div>
                <div className="flex justify-between items-center mb-2">
                  {newMembers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveNewMemberField(nm.id)}
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
            onClick={handleAddNewMemberField}
            className="w-full"
            title="আরো সদস্য যোগ করুন"
          >
            <Plus />
          </button>
        </div>
      )}

      {Object.keys(groupedMembers).length === 0 ? (
        <div className="py-4 font-bengali text-stone-500 text-center">
          কোন সদস্য পাওয়া যায়নি।
        </div>
      ) : (
        Object.entries(groupedMembers).map(([dafter, members]) => (
          <div key={dafter} className="mb-4">
            <div className="font-bengali font-bold text-lg mb-2 text-stone-700 border-b pb-1">
              {dafter}
            </div>
            {members.map((m) => (
              <div
                key={`${m.dafter}-${m.designation}`}
                className="mb-3"
              >
                <div className="flex justify-between items-center">
                  <div
                    className="font-bengali font-semibold text-md"
                    title={m.dafter}
                  >
                    {m.designation}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 w-full mt-1">
                  {renderStandardInput(
                    `name-${m.designation}`,
                    "নাম",
                    m.name || '',
                    (e) => handleFieldChange(m.designation, m.dafter, 'name', e.target.value),
                    { wrapperClassName: "flex-1 min-w-35", readOnly: !isEditable, className: "w-full font-bengali" }
                  )}
                  {renderStandardInput(
                    `email-${m.designation}`,
                    "ইমেইল",
                    m.email || '',
                    (e) => handleFieldChange(m.designation, m.dafter, 'email', e.target.value),
                    { wrapperClassName: "flex-1 min-w-30", type: "email", readOnly: !isEditable, className: "w-full font-bengali" }
                  )}
                  {renderStandardInput(
                    `phone-${m.designation}`,
                    "মোবাইল",
                    m.phone || '',
                    (e) => handleFieldChange(m.designation, m.dafter, 'phone', e.target.value),
                    { wrapperClassName: "flex-1 min-w-30", readOnly: !isEditable, className: "w-full font-bengali" }
                  )}
                  {renderStandardInput(
                    `whatsapp-${m.designation}`,
                    "হোয়াটসঅ্যাপ",
                    m.whatsapp || '',
                    (e) => handleFieldChange(m.designation, m.dafter, 'whatsapp', e.target.value),
                    { wrapperClassName: "flex-1 min-w-25", readOnly: !isEditable, className: "w-full font-bengali" }
                  )}
                </div>
                {isEditable && (
                  <button
                    type="button"
                    title="সদস্য মুছে ফেলুন"
                    onClick={() =>
                      handleRemoveExistingMember(
                        m.designation,
                        m.dafter
                      )
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))
      )}

      <div className="absolute flex justify-end gap-0.5">
        <button type="button" onClick={handleToggleEdit} title={isEditable ? 'দর্শন মোড' : 'পরিবর্তন মোড'}>
          {isEditable ? <Lock /> : <Pencil />}
        </button>
        {isEditable && (
          <>
            <button type="button" onClick={handleDiscard} title="অপরিবর্তিত রাখুন">
              <Trash2 />
            </button>
            <button type="button" onClick={handleSave} title="পরিবর্তন সংরক্ষণ করুন">
              <Save />
            </button>
          </>
        )}
      </div>
    </form>
  );
}
