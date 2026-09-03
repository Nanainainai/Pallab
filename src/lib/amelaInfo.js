import { writeTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { loadJsonDataFile } from "./letterUtils";

let officers = null;
let officerIds = null;

/**
 * Dynamically loads and reads amela.json from ~/Documents/Pallab/data/amela.json
 */
async function loadAmelaData() {
    return loadJsonDataFile("amela.json", {});
}

/**
 * Reads titles.json from ~/Documents/Pallab/data/titles.json
 */
async function loadTitlesMap() {
    return loadJsonDataFile("titles.json", {});
}

/**
 * Reads jamaat.json from ~/Documents/Pallab/data/jamaat.json
 */
async function loadJamaatMap() {
    return loadJsonDataFile("jamaat.json", {});
}

/**
 * Clears cached officers data (useful after saving new amela data)
 */
export function reloadAmelaData() {
    officers = null;
    officerIds = null;
}

async function flatten() {
    if (officers) return officers;

    const amela = await loadAmelaData();
    officers = [];

    for (const [reach, jamaats] of Object.entries(amela)) {
        if (!jamaats || typeof jamaats !== "object") continue;
        for (const [jamaat, departments] of Object.entries(jamaats)) {
            if (!departments || typeof departments !== "object") continue;
            for (const [department, fields] of Object.entries(departments)) {
                if (!fields || typeof fields !== "object") continue;
                for (const [field, titles] of Object.entries(fields)) {
                    if (!titles || typeof titles !== "object") continue;
                    for (const [title, person] of Object.entries(titles)) {
                        officers.push({
                            reach,
                            jamaat,
                            department,
                            field,
                            title,
                            ...(typeof person === "object" ? person : {})
                        });
                    }
                }
            }
        }
    }

    return officers;
}

export async function getOptions(field, filters = {}) {
    const data = await flatten();

    const filtered = data.filter(person =>
        Object.entries(filters).every(([key, value]) => {
            return !value || person[key] === value;
        })
    );

    return [...new Set(filtered.map(person => person[field]))].filter(Boolean).sort();
}

export async function getPerson(filters = {}) {
    const data = await flatten();
    return data.find(person =>
        Object.entries(filters).every(([key, value]) => {
            if (!value) return true;
            // Match title or department directly
            return person[key] === value;
        })
    );
}

export async function getDafter(filters = {}) {
    // Lookup primarily by title if available, as title unique identifies the field/dafter
    if (filters.title) {
        const data = await flatten();
        const match = data.find(person =>
            person.title === filters.title &&
            (!filters.jamaat || person.jamaat === filters.jamaat)
        );
        if (match?.field) return match.field;
    }
    const person = await getPerson(filters);
    return person?.field || "";
}

export async function autofillPerson(formValues, changedField, value) {
    const updated = {
        ...formValues,
        [changedField]: value
    };

    const data = await flatten();
    let matches = [];

    switch (changedField) {
        case "sender":
        case "receiver":
        case "onulipi-holder":
            matches = data.filter(entry => entry.name === value);
            break;

        case "sender-title":
        case "receiver-title":
            matches = data.filter(entry => entry.title === value);
            break;

        case "sender-jamaat":
        case "receiver-jamaat":
            matches = data.filter(entry => entry.jamaat === value);
            break;

        case "sender-department":
        case "receiver-department":
            matches = data.filter(entry => entry.department === value);
            break;

        case "sender-reach":
        case "receiver-reach":
            matches = data.filter(entry => entry.reach === value);
            break;
    }

    // Don't autofill if zero or multiple matches (ambiguous)
    if (matches.length !== 1) return updated;

    const person = matches[0];

    const prefix = changedField.startsWith("receiver")
        ? "receiver"
        : changedField.startsWith("sender")
            ? "sender"
            : "onulipi";

    updated[`${prefix}-reach`] = person.reach;
    updated[`${prefix}-jamaat`] = person.jamaat;
    updated[`${prefix}-department`] = person.department;

    if (prefix !== "onulipi") {
        updated[`${prefix}-title`] = person.title;
        updated[prefix] = person.name;
    }

    return updated;
}

export async function getOfficerIds() {
    if (officerIds) return officerIds;

    const data = await flatten();
    const titlesInAmela = [...new Set(data.map(x => x.title))].filter(Boolean);
    const titleMap = await loadTitlesMap();
    const jamaatMap = await loadJamaatMap();

    // Find current highest ID assigned
    let maxId = 0;
    for (const id of Object.values(titleMap)) {
        if (typeof id === "number" && id > maxId) {
            maxId = id;
        }
    }

    // Assign new incrementing IDs to unmapped titles
    let requiresSave = false;
    for (const title of titlesInAmela) {
        if (titleMap[title] === undefined) {
            maxId += 1;
            titleMap[title] = maxId;
            requiresSave = true;
        }
    }

    // Persist additions to titles.json
    if (requiresSave) {
        try {
            const relativePath = "Pallab/data/titles.json";
            await writeTextFile(
                relativePath,
                JSON.stringify(titleMap, null, 2),
                { baseDir: BaseDirectory.Document }
            );
        } catch (error) {
            console.error("Failed persisting titles.json:", error);
        }
    }

    officerIds = {
        reach: [...new Set(data.map(x => x.reach))].filter(Boolean).sort(),
        jamaat: [...new Set(data.map(x => x.jamaat))].filter(Boolean).sort(),
        department: [...new Set(data.map(x => x.department))].filter(Boolean).sort(),
        field: [...new Set(data.map(x => x.field))].filter(Boolean).sort(),
        titleMap,
        jamaatMap
    };

    return officerIds;
}