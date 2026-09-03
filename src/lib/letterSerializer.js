import { readTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";

import { getOfficerIds, getDafter } from "./amelaInfo";

/*==============================================================================
  Helpers
==============================================================================*/

const idOf = (array, value) =>
    Array.isArray(array) ? array.indexOf(value) : -1;

async function loadTemplates() {
    try {
        const relativePath = "Pallab/data/templates.json";
        const fileExists = await exists(relativePath, {
            baseDir: BaseDirectory.Document
        });

        if (fileExists) {
            const content = await readTextFile(relativePath, {
                baseDir: BaseDirectory.Document
            });

            return JSON.parse(content);
        }

        console.warn(
            "File missing at ~/Documents/" + relativePath
        );
    } catch (error) {
        console.error("FS Error loading templates:", error);
    }

    return {};
}

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

        console.warn(
            "File missing at ~/Documents/" + relativePath
        );
    } catch (error) {
        console.error("FS Error loading jamaat:", error);
    }

    return {};
}

function getSubjectId(templates, subject) {
    if (!subject || !templates) return -1;

    // 1. Direct key check
    if (templates[subject] !== undefined) {
        if (templates[subject]?.id !== undefined) {
            return Number(templates[subject].id);
        }

        if (!isNaN(subject)) {
            return Number(subject);
        }
    }

    // 2. Search top-level entries
    for (const [key, template] of Object.entries(templates)) {
        if (template && typeof template === "object") {
            if (template.name === subject || key === subject) {
                return template.id !== undefined
                    ? Number(template.id)
                    : Number(key);
            }
        }
    }

    // 3. Search nested dafter entries
    for (const dafter of Object.values(templates)) {
        if (dafter && typeof dafter === "object") {
            for (const [key, template] of Object.entries(dafter)) {
                if (key === subject && template?.id !== undefined) {
                    return Number(template.id);
                }

                if (
                    template &&
                    typeof template === "object" &&
                    template.name === subject
                ) {
                    return template.id !== undefined
                        ? Number(template.id)
                        : Number(key);
                }
            }
        }
    }

    return -1;
}

function getTemplateContent(templates, subject) {
    if (!subject || !templates) return "";

    // Top-level subject
    if (
        templates[subject] &&
        templates[subject].content !== undefined
    ) {
        return templates[subject].content;
    }

    // Nested dafter subject
    for (const dafter of Object.values(templates)) {
        if (
            dafter &&
            typeof dafter === "object" &&
            subject in dafter
        ) {
            return dafter[subject]?.content ?? "";
        }
    }

    return "";
}

function normalizeContent(content) {
    if (
        content &&
        typeof content === "object" &&
        !Array.isArray(content) &&
        Array.isArray(content.content)
    ) {
        return content.content;
    }

    return content;
}

function bodyChanged(templates, subject, currentContent) {
    const templateContent = getTemplateContent(
        templates,
        subject
    );

    const normalizedTemplate = normalizeContent(templateContent);
    const normalizedCurrent = normalizeContent(currentContent);

    return (
        JSON.stringify(normalizedTemplate) !==
        JSON.stringify(normalizedCurrent)
    );
}

/*==============================================================================
  Letter Serializer
==============================================================================*/

export async function serializeLetter({
    formValues = {},
    subjects = [],
    onulipi = []
}) {
    const [templates, jamaatData] = await Promise.all([
        loadTemplates(),
        loadJamaatData()
    ]);

    const ids = (await getOfficerIds()) || {};

    const rid = value =>
        idOf(ids.reach, value);

    /*
     * Jamaat IDs come from jamaat.json:
     *
     * jamaat.json
     *   └── reach
     *       └── jamaat
     *           └── id
     *
     * Example:
     * jamaatData["স্থানীয়"]["নারায়ণগঞ্জ"].id === "067"
     */
    const jid = (reach, jamaat) => {
        if (!reach || !jamaat) return "";

        const reachData = jamaatData?.[reach];

        if (
            !reachData ||
            typeof reachData !== "object"
        ) {
            return "";
        }

        const jamaatEntry = reachData[jamaat];

        if (
            !jamaatEntry ||
            typeof jamaatEntry !== "object"
        ) {
            return "";
        }

        return jamaatEntry.id ?? "";
    };

    const did = value =>
        idOf(ids.department, value);

    const tid = value =>
        ids.titleMap &&
            ids.titleMap[value] !== undefined
            ? ids.titleMap[value]
            : -1;

    /*
     * Derive the dafter from the sender information.
     * m[3] stores the explicit/form dafter only when it differs
     * from the dafter implied by the sender's position.
     */
    const derivedDafter = await getDafter({
        reach: formValues["sender-reach"],
        jamaat: formValues["sender-jamaat"],
        department: formValues["sender-department"],
        title: formValues["sender-title"]
    });

    const explicitDafter =
        formValues.dafter ??
        formValues.Dafter ??
        "";

    const dafterStr =
        explicitDafter &&
            explicitDafter !== derivedDafter
            ? explicitDafter
            : "";

    const primaryCosmetics =
        subjects[0]?.cosmetics || {};

    const versions = subjects.map(entry => {
        const subjectId = getSubjectId(
            templates,
            entry.subject
        );

        const isBodyChanged = bodyChanged(
            templates,
            entry.subject,
            entry.content
        );

        return {
            /* Sender */
            s: [
                rid(formValues["sender-reach"]),

                jid(
                    formValues["sender-reach"],
                    formValues["sender-jamaat"]
                ),

                did(formValues["sender-department"]),

                tid(formValues["sender-title"]),

                formValues["sender"] || ""
            ],

            /* Receiver */
            r: [
                rid(formValues["receiver-reach"]),

                jid(
                    formValues["receiver-reach"],
                    formValues["receiver-jamaat"]
                ),

                did(formValues["receiver-department"]),

                tid(formValues["receiver-title"]),

                formValues["receiver"] || ""
            ],

            /* Meta */
            m: [
                subjectId,

                entry.date ||
                formValues.date ||
                "",

                entry.letterNo ||
                formValues["letter-no"] ||
                "",

                dafterStr,

                entry.letterType ??
                formValues.letterType ??
                0
            ],

            /* Onulipi */
            o: (onulipi || []).map(item => [
                rid(item.reach),

                jid(
                    item.reach,
                    item.jamaat
                ),

                did(item.department),

                item.holder || ""
            ]),

            /* Body */
            b: {
                v: Object.values(
                    entry.variables || {}
                ).map(v =>
                    v && typeof v === "object"
                        ? v.value
                        : v
                ),

                /*
                 * Empty array means the template body should be
                 * reconstructed by the deserializer.
                 *
                 * Otherwise store only the actual document content,
                 * not the surrounding { type: "doc", content: [] }.
                 */
                c: isBodyChanged
                    ? normalizeContent(entry.content) || []
                    : []
            },

            /* Attachment Pages */
            a: (entry.attachments || []).map(att => ({
                n: att.annexCode || "",

                c: [
                    ...(att.content
                        ? [
                            {
                                t: "t",
                                d: att.content
                            }
                        ]
                        : []),

                    ...(att.image
                        ? [
                            {
                                t: "i",
                                d: att.image,
                                cap: att.caption || ""
                            }
                        ]
                        : [])
                ]
            }))
        };
    });

    return {
        f: 1,

        c: [
            primaryCosmetics.greetingId ?? -1,
            primaryCosmetics.farewellId ?? -1,
            primaryCosmetics.quoteId ?? -1,
            formValues.boilerplate ?? 0
        ],

        v: versions
    };
}


/*
==============================================================================
    Letter Serializer
==============================================================================

File structure

f
    File format version.

v
    Saved versions of the letter.

Version structure

c
    Cosmetics
    [
        greeting id,
        farewell id,
        quote id,
        boilerplate id
    ]

s
    Sender
    [
        reach,
        jamaat,
        department,
        title,
        name
    ]

r
    Receiver
    [
        reach,
        jamaat,
        department,
        title,
        name
    ]

m
    Meta
    [
        subject id,
        date,
        letter no,
        dafter,
        letter type
    ]

o
    Onulipi
    [
        [
            reach,
            jamaat,
            department,
            holder
        ]
    ]

b
    Body
    {
        v : variable values
        c : edited content
    }

a
    Attachments
    [
        [
            image,
            text
        ]
    ]
*/