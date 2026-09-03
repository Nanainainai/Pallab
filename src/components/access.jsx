import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import HybridInput from './hybrid-input';
import { loadJsonDataFile } from '../lib/letterUtils';

export default function Access({ onLogin }) {
  const [amelaData, setAmelaData] = useState({});
  const [accountType, setAccountType] = useState('amela'); // 'dev' | 'admin' | 'amela'
  const [selectedReach, setSelectedReach] = useState('');
  const [selectedJamaat, setSelectedJamaat] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedTitle, setSelectedTitle] = useState('');

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load amela.json dynamically via the shared JSON data-file loader
  useEffect(() => {
    async function loadAmelaData() {
      const content = await loadJsonDataFile('amela.json', {});
      setAmelaData(content);
    }
    loadAmelaData();
  }, []);

  // Organization / Department options: 0 = Khuddam, 1 = Atfal, 2 = Main Jamaat
  const orgOptions = [
    { value: '0', label: "মজলিস খোদ্দামুল আহমদীয়া" },
    { value: '1', label: "মজলিস আতফালুল আহমদীয়া" },
    { value: '2', label: "আহমদীয়া মুসলিম জামা'ত" },
  ];

  // Options mapped for HybridInput dropdown displays
  const accountTypeOptions = [
    { value: 'amela', label: "আমেলা সদস্য" },
    { value: 'admin', label: "জামা'ত এডমিন" },
    { value: 'dev', label: "ডেভেলপার" },
  ];

  // Dynamically derive Reaches from amelaData
  const reachOptions = Object.keys(amelaData).map((reachName) => ({
    value: reachName,
    label: reachName,
  }));

  // Dynamically derive Jamaats based on selected reach
  const jamaatOptions = selectedReach && amelaData[selectedReach]
    ? Object.keys(amelaData[selectedReach]).map((jamaatName) => ({
      value: jamaatName,
      label: jamaatName,
    }))
    : [];

  // Dynamically extract Title options matching selected Reach, Jamaat, and Organization
  const availableTitles = (() => {
    if (!selectedReach || !selectedJamaat || !selectedOrg || !amelaData[selectedReach]?.[selectedJamaat]) {
      return [];
    }

    const orgMap = amelaData[selectedReach][selectedJamaat];
    const orgKey = orgOptions.find((o) => o.value === selectedOrg)?.label;

    if (!orgKey || !orgMap[orgKey]) return [];

    const titlesSet = new Set();
    const deptMap = orgMap[orgKey];

    Object.values(deptMap).forEach((titles) => {
      if (titles && typeof titles === 'object') {
        Object.keys(titles).forEach((titleName) => titlesSet.add(titleName));
      }
    });

    return Array.from(titlesSet).map((titleName) => ({
      value: titleName,
      label: titleName,
    }));
  })();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      const isValid = await invoke('authenticate_user', {
        accountType,
        reachNo: selectedReach,
        jamaatNo: selectedJamaat,
        departmentNo: selectedOrg,
        titleNo: selectedTitle,
        inputPassword: password,
      });

      if (isValid) {
        onLogin({
          accountType,
          reachNo: selectedReach,
          jamaatNo: selectedJamaat,
          departmentNo: selectedOrg,
          titleNo: selectedTitle,
        });
      } else {
        setErrorMsg('পাসওয়ার্ড ভুল হয়েছে। আবারও চেষ্টা করুন...');
      }
    } catch (err) {
      setErrorMsg(err.toString());
    }
  };

  const getLabel = (options, val) => options.find((o) => o.value === val)?.label || val;

  return (
    <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3 mx-auto w-full max-w-md font-bengali">
      <div className="flex flex-col items-end mb-2">
        <h1 className="pb-1 font-arabic text-xl">السلام عليكم ورحمة الله وبركاته</h1>
        <h2 className="text-gray-700 text-sm">দয়া করে লগ-ইন করুন...</h2>
      </div>

      <div className="w-full">
        <HybridInput
          name="accountType"
          placeholderInitial="একাউন্ট ধরণ"
          defaultValue="আমেলা সদস্য"
          options={accountTypeOptions}
          value={getLabel(accountTypeOptions, accountType)}
          onChange={(e) => {
            setAccountType(e.target.value);
            setSelectedReach('');
            setSelectedJamaat('');
            setSelectedOrg('');
            setSelectedTitle('');
          }}
        />
      </div>

      {accountType !== 'dev' && (
        <>
          <div className="gap-x-2 grid grid-cols-2 w-full">
            <HybridInput
              name="reach"
              placeholderInitial="পর্যায়"
              defaultValue="পর্যায় নির্বাচন করুন"
              options={reachOptions}
              value={getLabel(reachOptions, selectedReach)}
              onChange={(e) => {
                setSelectedReach(e.target.value);
                setSelectedJamaat('');
              }}
              required
            />

            <HybridInput
              name="jamaat"
              placeholderInitial="জামা'ত"
              defaultValue="জামা'ত নির্বাচন করুন"
              options={jamaatOptions}
              value={getLabel(jamaatOptions, selectedJamaat)}
              onChange={(e) => setSelectedJamaat(e.target.value)}
              readOnly={!selectedReach}
              required
            />
          </div>

          <div className="w-full">
            <HybridInput
              name="organization"
              placeholderInitial="সংগঠন"
              defaultValue="সংগঠন নির্বাচন করুন"
              options={orgOptions}
              value={getLabel(orgOptions, selectedOrg)}
              onChange={(e) => {
                setSelectedOrg(e.target.value);
                setSelectedTitle('');
              }}
              required
            />
          </div>
        </>
      )}

      {accountType === 'amela' && (
        <div className="w-full">
          <HybridInput
            name="title"
            placeholderInitial="পদবী"
            defaultValue="পদবী নির্বাচন করুন"
            options={availableTitles}
            value={getLabel(availableTitles, selectedTitle)}
            onChange={(e) => setSelectedTitle(e.target.value)}
            required
          />
        </div>
      )}

      <div className="gap-x-2 grid grid-cols-[1fr_auto] w-full">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="অ্যাডমিন প্রদত্ত পাসওয়ার্ড"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full font-bengali cursor-none"
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="px-3"
        >
          {showPassword ? <EyeOff /> : <Eye />}
        </button>
      </div>

      {errorMsg && (
        <p className="text-red-500 text-sm text-right">{errorMsg}</p>
      )}

      <button
        type="submit"
        className="flex justify-center items-center gap-2 mt-2 w-full"
      >
        <span>লগ ইন</span>
        <LogIn />
      </button>
    </form>
  );
}