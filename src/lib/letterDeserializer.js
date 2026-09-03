import { readTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { getOfficerIds, getDafter } from "./amelaInfo";

/*
==============================================================================
    Helpers - data loading
==============================================================================
*/

async function loadJamaatData() {
  try {
    const relativePath = "Pallab/data/jamaat.json";
    const fileExists = await exists(relativePath, {
      baseDir: BaseDirectory.Document
    });

    if (fileExists) {
      const content = await readTextFile(relativePath, {
        baseDir: BaseDirectory.Document
      });

      return JSON.parse(content);
    }
  } catch (error) {
    console.error("FS Error loading jamaat:", error);
  }

  return {};
}

async function loadTemplates() {
  try {
    const relativePath = "Pallab/data/templates.json";
    const fileExists = await exists(relativePath, { baseDir: BaseDirectory.Document });
    if (fileExists) {
      const content = await readTextFile(relativePath, { baseDir: BaseDirectory.Document });
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("FS Error loading templates:", error);
  }
  return {};
}

async function loadCosmetics() {
  try {
    const relativePath = "Pallab/data/cosmetics.json";
    const fileExists = await exists(relativePath, { baseDir: BaseDirectory.Document });
    if (fileExists) {
      const content = await readTextFile(relativePath, { baseDir: BaseDirectory.Document });
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("FS Error loading cosmetics:", error);
  }
  return {};
}

async function loadAmelaData() {
  try {
    const relativePath = "Pallab/data/amela.json";
    const fileExists = await exists(relativePath, { baseDir: BaseDirectory.Document });
    if (fileExists) {
      const content = await readTextFile(relativePath, { baseDir: BaseDirectory.Document });
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("FS Error loading amela:", error);
  }
  return {};
}

/*
==============================================================================
    Helpers - pointer resolution & lookups
==============================================================================
*/

function resolveValue(val, versions, pathKeys) {
  if (typeof val === "string" && val.startsWith("v")) {
    const idxStr = val.split("/")[0].slice(1);
    const idx = parseInt(idxStr, 10);
    if (!isNaN(idx) && versions[idx]) {
      let current = versions[idx];
      for (const key of pathKeys) {
        if (current && current[key] !== undefined) {
          current = current[key];
        }
      }
      return current;
    }
  }
  return val;
}

function getByIdx(array, index) {
  if (typeof index === "string") return index;
  if (typeof index !== "number" || isNaN(index)) return "";
  return Array.isArray(array) && index >= 0 && index < array.length ? array[index] : "";
}

function resolveDepartment(val, ids) {
  if (val === undefined || val === null) return "";

  const orgMap = {
    0: "মজলিস খোদ্দামুল আহমদীয়া",
    1: "মজলিস আতফালুল আহমদীয়া",
    2: "আহমদীয়া মুসলিম জামা'ত"
  };

  const num = Number(val);
  if (!isNaN(num) && orgMap[num] !== undefined) {
    return orgMap[num];
  }

  if (typeof val === "string" && isNaN(Number(val)) && val.trim() !== "") {
    return val;
  }

  return getByIdx(ids?.department, num) || (typeof val === "string" ? val : "");
}

function resolveTitle(titleRaw, titleMap) {
  if (titleRaw === undefined || titleRaw === null || titleRaw === -1 || titleRaw === "-1") return "";

  if (typeof titleRaw === "string" && isNaN(Number(titleRaw)) && titleRaw.trim() !== "") {
    return titleRaw;
  }

  const numId = Number(titleRaw);
  if (!isNaN(numId) && titleMap) {
    for (const [title, val] of Object.entries(titleMap)) {
      if (Number(val) === numId) {
        return title;
      }
    }
  }

  return typeof titleRaw === "string" ? titleRaw : "";
}

function resolveReach(val, ids) {
  if (val === undefined || val === null) return "";
  if (typeof val === "string" && isNaN(Number(val))) return val;
  const num = Number(val);
  if (!isNaN(num) && num >= 0) {
    return getByIdx(ids?.reach, num) || (typeof val === "string" ? val : "");
  }
  return typeof val === "string" ? val : "";
}

function resolveJamaat(val, jamaatData, reach) {
  if (val === undefined || val === null || val === "") {
    return "";
  }

  const stringVal = String(val);

  if (
    jamaatData &&
    typeof jamaatData === "object" &&
    reach &&
    jamaatData[reach] &&
    typeof jamaatData[reach] === "object"
  ) {
    for (const [jamaatName, jamaatEntry] of Object.entries(
      jamaatData[reach]
    )) {
      if (
        jamaatEntry &&
        typeof jamaatEntry === "object" &&
        String(jamaatEntry.id ?? "") === stringVal
      ) {
        return jamaatName;
      }
    }
  }

  if (
    jamaatData &&
    typeof jamaatData === "object" &&
    reach &&
    jamaatData[reach] &&
    Object.prototype.hasOwnProperty.call(
      jamaatData[reach],
      stringVal
    )
  ) {
    return stringVal;
  }

  const num = Number(val);

  if (
    !isNaN(num) &&
    num >= 0 &&
    Array.isArray(jamaatData?.jamaat)
  ) {
    return jamaatData.jamaat[num] || stringVal;
  }

  return stringVal;
}

function findTemplateEntry(templates, subjectName) {
  if (!subjectName || !templates) return null;

  if (templates[subjectName] && typeof templates[subjectName] === "object") {
    return templates[subjectName];
  }

  for (const [key, template] of Object.entries(templates)) {
    if (template && typeof template === "object") {
      if (template.name === subjectName || key === subjectName) return template;
    }
  }

  for (const dafter of Object.values(templates)) {
    if (dafter && typeof dafter === "object") {
      for (const [key, template] of Object.entries(dafter)) {
        if (key === subjectName) return template;
        if (template && typeof template === "object" && template.name === subjectName) {
          return template;
        }
      }
    }
  }

  return null;
}

function getSubjectNameById(templates, id) {
  if (id === -1 || id === undefined || id === null || !templates) return "";

  for (const [key, template] of Object.entries(templates)) {
    if (template && typeof template === "object") {
      const templateId = template.id !== undefined ? Number(template.id) : Number(key);
      if (templateId === id) return template.name || key;
    }
  }

  for (const dafter of Object.values(templates)) {
    if (dafter && typeof dafter === "object") {
      for (const [key, template] of Object.entries(dafter)) {
        if (template && typeof template === "object") {
          const templateId = template.id !== undefined ? Number(template.id) : Number(key);
          if (templateId === id) return template.name || key;
        }
      }
    }
  }

  return "";
}

function resolveDafter(sender, subjectId, subjectName, templates, amelaData) {
  if (amelaData && typeof amelaData === "object" && sender?.title) {
    for (const jamaats of Object.values(amelaData)) {
      if (!jamaats || typeof jamaats !== "object") continue;
      for (const orgs of Object.values(jamaats)) {
        if (!orgs || typeof orgs !== "object") continue;
        for (const depts of Object.values(orgs)) {
          if (!depts || typeof depts !== "object") continue;
          for (const [dafterName, titles] of Object.entries(depts)) {
            if (titles && typeof titles === "object" && titles[sender.title]) {
              return dafterName;
            }
          }
        }
      }
    }
  }

  if (templates && typeof templates === "object") {
    for (const [dafterKey, dafterObj] of Object.entries(templates)) {
      if (dafterObj && typeof dafterObj === "object" && !dafterObj.content && !dafterObj.id) {
        for (const [tplKey, tplVal] of Object.entries(dafterObj)) {
          if (tplVal && typeof tplVal === "object") {
            const tId = tplVal.id !== undefined ? Number(tplVal.id) : Number(tplKey);
            if (tId === subjectId || tplKey === subjectName || tplVal.name === subjectName) {
              return dafterKey;
            }
          }
        }
      }
    }
  }

  return "";
}

function toEnglishDigits(str = "") {
  const map = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  return String(str).replace(/[০-৯]/g, char => map[char] || char);
}

function deriveFiscalYear(dateStr, org = "") {
  const engDigits = toEnglishDigits(dateStr);
  const parts = engDigits.split(/[.-/]/);

  let year;
  let month;

  if (parts.length === 3) {
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    const p3 = parseInt(parts[2], 10);

    if (p3 > 1000) {
      year = p3;
      month = p2;
    } else if (p1 > 1000) {
      year = p1;
      month = p2;
    }
  } else {
    const parsedYear = parseInt(engDigits, 10);

    if (!isNaN(parsedYear) && parsedYear > 2000) {
      year = parsedYear;
    }
  }

  if (!year || !month) {
    year = new Date().getFullYear();
    month = new Date().getMonth() + 1;
  }

  const isAuxiliary =
    org.includes("মজলিস খোদ্দামুল আহমদীয়া") ||
    org.includes("মজলিস আতফালুল আহমদীয়া");

  let fyStart = year;
  let fyEnd = year + 1;

  if (isAuxiliary) {
    if (month < 11) {
      fyStart = year - 1;
      fyEnd = year;
    }
  } else {
    if (month < 7) {
      fyStart = year - 1;
      fyEnd = year;
    }
  }

  return {
    fyStart: String(fyStart),
    fyEnd: String(fyEnd).padStart(2, "0"),
  };
}

/*
==============================================================================
    Helpers - Block Resolvers
==============================================================================
*/

function resolvePersonBlock(
  arr,
  versions,
  blockKey,
  ids,
  titleMap,
  jamaatData
) {
  const safeArr = Array.isArray(arr) ? arr : [];

  const reachRaw = resolveValue(
    safeArr[0],
    versions,
    [blockKey, "0"]
  );

  const jamaatRaw = resolveValue(
    safeArr[1],
    versions,
    [blockKey, "1"]
  );

  const deptRaw = resolveValue(
    safeArr[2],
    versions,
    [blockKey, "2"]
  );

  const titleRaw = resolveValue(
    safeArr[3],
    versions,
    [blockKey, "3"]
  );

  const nameRaw = resolveValue(
    safeArr[4],
    versions,
    [blockKey, "4"]
  );

  const reach = resolveReach(reachRaw, ids);

  return {
    reach,

    jamaat: resolveJamaat(
      jamaatRaw,
      jamaatData,
      reach
    ),

    department: resolveDepartment(
      deptRaw,
      ids
    ),

    title: resolveTitle(
      titleRaw,
      titleMap
    ),

    name:
      typeof nameRaw === "string"
        ? nameRaw
        : String(nameRaw ?? "")
  };
}

function resolveOnulipi(
  version,
  versions,
  ids,
  jamaatData
) {
  const oArr = Array.isArray(version?.o)
    ? version.o
    : [];

  return oArr.map((entry, idx) => {
    const safeEntry = Array.isArray(entry)
      ? entry
      : [];

    const idxStr = String(idx);

    const reachRaw = resolveValue(
      safeEntry[0],
      versions,
      ["o", idxStr, "0"]
    );

    const jamaatRaw = resolveValue(
      safeEntry[1],
      versions,
      ["o", idxStr, "1"]
    );

    const deptRaw = resolveValue(
      safeEntry[2],
      versions,
      ["o", idxStr, "2"]
    );

    const holderRaw = resolveValue(
      safeEntry[3],
      versions,
      ["o", idxStr, "3"]
    );

    const reach = resolveReach(
      reachRaw,
      ids
    );

    return {
      reach,

      jamaat: resolveJamaat(
        jamaatRaw,
        jamaatData,
        reach
      ),

      department: resolveDepartment(
        deptRaw,
        ids
      ),

      holder:
        typeof holderRaw === "string"
          ? holderRaw
          : String(holderRaw ?? "")
    };
  });
}

function resolveMeta(version, versions, templates) {
  const metaArr = Array.isArray(version?.m) ? version.m : [];

  const subjectIdRaw = resolveValue(metaArr[0], versions, ["m", "0"]);
  const dateRaw = resolveValue(metaArr[1], versions, ["m", "1"]);
  const letterNoRaw = resolveValue(metaArr[2], versions, ["m", "2"]);
  const dafterRaw = resolveValue(metaArr[3], versions, ["m", "3"]);
  const letterTypeRaw = resolveValue(metaArr[4], versions, ["m", "4"]);

  const subjectId = typeof subjectIdRaw === "number" ? subjectIdRaw : Number(subjectIdRaw);
  const subjectName = getSubjectNameById(templates, isNaN(subjectId) ? -1 : subjectId);

  return {
    subjectId: isNaN(subjectId) ? -1 : subjectId,
    subjectName: subjectName || (typeof subjectIdRaw === "string" ? subjectIdRaw : ""),
    date: typeof dateRaw === "string" ? dateRaw : String(dateRaw ?? ""),
    letterNo: letterNoRaw !== undefined && letterNoRaw !== null ? String(letterNoRaw) : "",
    dafter: typeof dafterRaw === "string" ? dafterRaw : String(dafterRaw ?? ""),
    letterType: typeof letterTypeRaw === "number" ? letterTypeRaw : (Number(letterTypeRaw) || 0)
  };
}

function resolveBody(version, versions, subjectName, templates) {
  const bodyObj = version?.b || {};
  const rawContent = resolveValue(bodyObj.c, versions, ["b", "c"]);

  const templateEntry = findTemplateEntry(templates, subjectName);
  const templateContent = templateEntry?.content ?? templateEntry?.body ?? "";
  const templateVars = templateEntry?.variables ?? {};

  let finalContent = "";
  if (!rawContent || (Array.isArray(rawContent) && rawContent.length === 0)) {
    finalContent = templateContent;
  } else if (Array.isArray(rawContent)) {
    finalContent = { type: "doc", content: rawContent };
  } else {
    finalContent = rawContent;
  }

  const varNames = Object.keys(templateVars);
  const rawVarsArr = Array.isArray(bodyObj.v) ? bodyObj.v : [];
  const variables = {};

  rawVarsArr.forEach((v, i) => {
    const value = resolveValue(v, versions, ["b", "v", String(i)]);
    const name = varNames[i] ?? `চলক ${i + 1}`;

    const rawTplVar = templateVars[name];
    const type = typeof rawTplVar === "object" && rawTplVar !== null
      ? rawTplVar.type || "text"
      : "text";

    variables[name] = { type, value: String(value ?? "") };
  });

  return { content: finalContent, variables };
}

function resolveAttachments(version) {
  const aArr = Array.isArray(version?.a) ? version.a : [];

  return aArr.map((att) => {
    const cArr = Array.isArray(att?.c) ? att.c : [];
    const textPart = cArr.find((p) => p?.t === "t");
    const imagePart = cArr.find((p) => p?.t === "i");

    return {
      annexCode: att?.n || "",
      content: textPart?.d || "",
      image: imagePart?.d || "",
      caption: imagePart?.cap || ""
    };
  });
}

function resolveCosmeticsBlock(cosmeticsData, cArr) {
  const safeArr = Array.isArray(cArr) ? cArr : [];
  const [greetingId, farewellId, quoteId, boilerplateId] = safeArr;

  return {
    greetingId: greetingId ?? -1,
    greeting: cosmeticsData?.greetings?.[greetingId] ?? "",
    farewellId: farewellId ?? -1,
    farewell: cosmeticsData?.farewell?.[farewellId] ?? "",
    quoteId: quoteId ?? -1,
    quote: cosmeticsData?.quote?.[quoteId] ?? { text: "", author: "" },
    boilerplate: boilerplateId ?? 0
  };
}

/*
==============================================================================
    Main Deserializer Function
==============================================================================
*/

export async function deserializeLetter(letterJson) {
  const versions = Array.isArray(letterJson?.v) ? letterJson.v : [];

  if (versions.length === 0) {
    return { formValues: {}, onulipi: [] };
  }

  const [
    templates,
    ids,
    cosmeticsData,
    amelaData,
    jamaatData
  ] = await Promise.all([
    loadTemplates(),
    getOfficerIds(),
    loadCosmetics(),
    loadAmelaData(),
    loadJamaatData()
  ]);
  const titleMap = ids.titleMap || {};

  const latestVersion = versions[versions.length - 1];

  const sender = resolvePersonBlock(
    latestVersion.s,
    versions,
    "s",
    ids,
    titleMap,
    jamaatData
  );

  const receiver = resolvePersonBlock(
    latestVersion.r,
    versions,
    "r",
    ids,
    titleMap,
    jamaatData
  );

  const onulipi = resolveOnulipi(
    latestVersion,
    versions,
    ids,
    jamaatData
  );
  const meta = resolveMeta(latestVersion, versions, templates);
  const body = resolveBody(latestVersion, versions, meta.subjectName, templates);
  const attachments = resolveAttachments(latestVersion);
  const cosmetics = resolveCosmeticsBlock(cosmeticsData, letterJson.c);

  const derivedDafter = await getDafter({
    reach: sender.reach,
    jamaat: sender.jamaat,
    department: sender.department,
    title: sender.title
  });

  // Prioritize meta.dafter, derivedDafter from title lookup, then resolveDafter
  const dafter = meta.dafter?.trim() || derivedDafter || resolveDafter(sender, meta.subjectId, meta.subjectName, templates, amelaData);
  const fy = deriveFiscalYear(meta.date, sender.department);

  const primarySubject = {
    subject: meta.subjectName,
    dafter: dafter,
    department: sender.department,
    sender: sender.name,
    senderTitle: sender.title,
    senderDepartment: sender.department,
    senderJamaat: sender.jamaat,
    letterType: meta.letterType,
    date: meta.date,
    letterNo: meta.letterNo,
    fyStart: fy.fyStart,
    fyEnd: fy.fyEnd,
    content: body.content,
    variables: body.variables,
    attachments,
    cosmetics
  };

  const formValues = {
    "sender-reach": sender.reach,
    "sender-jamaat": sender.jamaat,
    "sender-department": sender.department,
    "sender-title": sender.title,
    sender: sender.name,

    "receiver-reach": receiver.reach,
    "receiver-jamaat": receiver.jamaat,
    "receiver-department": receiver.department,
    "receiver-title": receiver.title,
    receiver: receiver.name,

    dafter: dafter,
    department: sender.department,
    subject: meta.subjectName,
    date: meta.date,
    "letter-no": meta.letterNo,
    letterType: meta.letterType,

    "fy-start": fy.fyStart,
    "fy-end": fy.fyEnd,

    boilerplate: cosmetics.boilerplate,

    onulipi,
    subjects: [primarySubject]
  };

  return { formValues, onulipi };
}