import React, { useEffect, useState } from "react";
import { Pencil, Lock, Save, Trash2, Plus } from "lucide-react";
import HybridInput, { renderStandardInput } from "./hybrid-input";
import { loadJsonDataFile, saveJsonDataFile, clone } from "../lib/letterUtils";

const createEmptyOrganization = () => ({
  address: "",
  phone: "",
  email: "",
});

const createEmptyJamaat = () => ({
  name: "",
});

export default function JamaatEditor() {
  const [data, setData] = useState({});
  const [isEditable, setIsEditable] = useState(false);

  const [selectedReach, setSelectedReach] =
    useState("");

  const [selectedJamaat, setSelectedJamaat] =
    useState("");

  const [
    newJamaats,
    setNewJamaats,
  ] = useState([createEmptyJamaat()]);

  const [
    newOrganizations,
    setNewOrganizations,
  ] = useState([]);

  const loadJamaatData = async () => {
    const parsed = await loadJsonDataFile(
      "jamaat.json",
      {}
    );

    setData(parsed);
  };

  useEffect(() => {
    loadJamaatData();
  }, []);

  const reachOptions = Object.keys(
    data || {}
  );

  const jamaatOptions =
    selectedReach &&
      data[selectedReach]
      ? Object.keys(
        data[selectedReach]
      )
      : [];

  const selectedJamaatData =
    selectedReach &&
      selectedJamaat
      ? data[selectedReach]?.[
      selectedJamaat
      ] || {}
      : {};

  useEffect(() => {
    if (
      reachOptions.length > 0 &&
      !selectedReach
    ) {
      setSelectedReach(
        reachOptions[0]
      );
    }
  }, [data]);

  useEffect(() => {
    if (jamaatOptions.length > 0) {
      if (
        !jamaatOptions.includes(
          selectedJamaat
        )
      ) {
        setSelectedJamaat(
          jamaatOptions[0]
        );
      }
    } else {
      setSelectedJamaat("");
    }
  }, [selectedReach, data]);

  const getActiveOrganizations = () => {
    if (
      !selectedReach ||
      !selectedJamaat
    ) {
      return [];
    }

    const jamaat =
      data[selectedReach]?.[
      selectedJamaat
      ];

    if (
      !jamaat ||
      typeof jamaat !== "object"
    ) {
      return [];
    }

    return Object.entries(jamaat)
      .filter(
        ([organization, info]) =>
          organization &&
          info &&
          typeof info === "object"
      )
      .map(
        ([organization, info]) => ({
          organization,
          address:
            info.address || "",
          phone:
            info.phone || "",
          email:
            info.email || "",
        })
      );
  };

  const handleFieldChange = (
    organization,
    field,
    value
  ) => {
    if (!isEditable) {
      return;
    }

    const updated = clone(data);

    if (
      !updated[selectedReach]
    ) {
      updated[selectedReach] = {};
    }

    if (
      !updated[selectedReach][
      selectedJamaat
      ]
    ) {
      updated[selectedReach][
        selectedJamaat
      ] = {};
    }

    if (
      !updated[selectedReach][
      selectedJamaat
      ][organization]
    ) {
      updated[selectedReach][
        selectedJamaat
      ][organization] =
        createEmptyOrganization();
    }

    updated[selectedReach][
      selectedJamaat
    ][organization][field] =
      value;

    setData(updated);
  };

  const handleRemoveOrganization = (
    organization
  ) => {
    if (!isEditable) {
      return;
    }

    const updated = clone(data);

    const jamaat =
      updated[selectedReach]?.[
      selectedJamaat
      ];

    if (
      !jamaat?.[organization]
    ) {
      return;
    }

    delete jamaat[
      organization
    ];

    setData(updated);
  };

  const handleAddNewJamaatField =
    () => {
      setNewJamaats((previous) => [
        ...previous,
        createEmptyJamaat(),
      ]);
    };

  const handleRemoveNewJamaatField =
    (index) => {
      setNewJamaats((previous) =>
        previous.filter(
          (_, itemIndex) =>
            itemIndex !== index
        )
      );
    };

  const handleNewJamaatChange = (
    index,
    value
  ) => {
    setNewJamaats((previous) =>
      previous.map(
        (item, itemIndex) =>
          itemIndex === index
            ? {
              ...item,
              name: value,
            }
            : item
      )
    );
  };

  const handleAddOrganizationField =
    () => {
      setNewOrganizations(
        (previous) => [
          ...previous,
          {
            id:
              Date.now() +
              Math.random(),
            organization: "",
            address: "",
            phone: "",
            email: "",
          },
        ]
      );
    };

  const handleRemoveOrganizationField =
    (id) => {
      setNewOrganizations(
        (previous) =>
          previous.filter(
            (item) =>
              item.id !== id
          )
      );
    };

  const handleNewOrganizationChange =
    (
      id,
      field,
      value
    ) => {
      setNewOrganizations(
        (previous) =>
          previous.map(
            (item) =>
              item.id === id
                ? {
                  ...item,
                  [field]: value,
                }
                : item
          )
      );
    };

  const handleToggleEdit = () => {
    setIsEditable(
      (previous) => !previous
    );
  };

  const handleSave = async () => {
    const updated = clone(data);

    newJamaats.forEach(
      (jamaat) => {
        const name =
          jamaat.name.trim();

        if (
          !name ||
          !selectedReach.trim()
        ) {
          return;
        }

        if (
          !updated[selectedReach]
        ) {
          updated[selectedReach] =
            {};
        }

        if (
          !updated[selectedReach][name]
        ) {
          updated[selectedReach][
            name
          ] = {};
        }
      }
    );

    newOrganizations.forEach(
      (organization) => {
        const name =
          organization.organization.trim();

        if (
          !name ||
          !selectedReach.trim() ||
          !selectedJamaat.trim()
        ) {
          return;
        }

        if (
          !updated[selectedReach]
        ) {
          updated[selectedReach] =
            {};
        }

        if (
          !updated[selectedReach][
          selectedJamaat
          ]
        ) {
          updated[selectedReach][
            selectedJamaat
          ] = {};
        }

        updated[selectedReach][
          selectedJamaat
        ][name] = {
          address:
            organization.address ||
            "",
          phone:
            organization.phone ||
            "",
          email:
            organization.email ||
            "",
        };
      }
    );

    try {
      await saveJsonDataFile({
        invokeCommand: "save_jamaat",
        invokeArgKey: "jamaatData",
        data: updated,
        fileName: "jamaat.json",
      });

      setData(updated);

      setNewJamaats([
        createEmptyJamaat(),
      ]);

      setNewOrganizations([]);

      alert(
        "Jamaat dataset updated successfully!"
      );
    } catch (error) {
      console.error(
        "Failed to save jamaat.json:",
        error
      );

      alert(
        "Failed to save changes to file: " +
        error
      );
    }
  };

  const handleDiscard = () => {
    loadJamaatData();

    setNewJamaats([
      createEmptyJamaat(),
    ]);

    setNewOrganizations([]);

    setIsEditable(false);
  };

  const groupedOrganizations =
    getActiveOrganizations();

  return (
    <form
      onSubmit={(event) =>
        event.preventDefault()
      }
    >
      <div className="gap-x-2 grid grid-cols-2 w-full">
        <HybridInput
          name="reach"
          label="পর্যায়"
          title="পর্যায়"
          autoComplete="off"
          placeholderInitial="পর্যায়"
          defaultValue="স্থানীয়"
          options={reachOptions}
          value={selectedReach}
          onChange={(event) =>
            setSelectedReach(
              event.target.value
            )
          }
          className="w-full font-bengali"
        />

        <HybridInput
          name="jamaat"
          label="জামা'ত"
          title="জামা'ত"
          autoComplete="off"
          placeholderInitial="জামা'ত"
          defaultValue="নারায়ণগঞ্জ"
          options={jamaatOptions}
          value={selectedJamaat}
          onChange={(event) =>
            setSelectedJamaat(
              event.target.value
            )
          }
          className="w-full font-bengali"
        />
      </div>

      {isEditable && (
        <>
          <div className="separator">
            নতুন জামা'ত
          </div>

          {newJamaats.map(
            (
              jamaat,
              index
            ) => (
              <div
                key={index}
                className="mb-4"
              >
                <div className="flex items-end gap-2">
                  {renderStandardInput(
                    `new-jamaat-${index}`,
                    "জামা'তের নাম",
                    jamaat.name,
                    (event) =>
                      handleNewJamaatChange(
                        index,
                        event.target.value
                      ),
                    { className: "font-bengali" }
                  )}

                  {newJamaats.length >
                    1 && (
                      <button
                        type="button"
                        title="ফিল্ড মুছে ফেলুন"
                        onClick={() =>
                          handleRemoveNewJamaatField(
                            index
                          )
                        }
                        className="pb-0.5"
                      >
                        <Trash2 />
                      </button>
                    )}
                </div>
              </div>
            )
          )}

          <button
            type="button"
            onClick={
              handleAddNewJamaatField
            }
            className="w-full"
            title="আরো জামা'ত যোগ করুন"
          >
            <Plus />
          </button>
        </>
      )}

      <div className="separator">
        সংগঠনসমূহ
      </div>

      {isEditable &&
        selectedReach &&
        selectedJamaat && (
          <div className="mb-6 pb-4 border-stone-200 border-b">
            <span className="font-bengali font-semibold text-md">
              নতুন সংগঠন যোগ করুন
            </span>

            {newOrganizations.map(
              (organization) => (
                <div
                  key={
                    organization.id
                  }
                  className="mb-4"
                >
                  <HybridInput
                    name={`new-org-${organization.id}`}
                    label="সংগঠন"
                    title="সংগঠন"
                    placeholderInitial="সংগঠন"
                    defaultValue="মজলিস খোদ্দামুল আহমদীয়া"
                    options={[
                      "মজলিস খোদ্দামুল আহমদীয়া",
                      "মজলিস আতফালুল আহমদীয়া",
                      "আহমদীয়া মুসলিম জামা'ত",
                    ]}
                    value={organization.organization}
                    onChange={(event) =>
                      handleNewOrganizationChange(
                        organization.id,
                        "organization",
                        event.target.value
                      )
                    }
                    className="mb-2 w-full font-bengali"
                  />

                  <div className="flex flex-wrap items-end gap-2 w-full">
                    <div className="flex-1 min-w-40">
                      {renderStandardInput(
                        `new-address-${organization.id}`,
                        "ঠিকানা",
                        organization.address,
                        (event) =>
                          handleNewOrganizationChange(
                            organization.id,
                            "address",
                            event.target.value
                          ),
                        { className: "font-bengali" }
                      )}
                    </div>

                    <div className="flex-1 min-w-30">
                      {renderStandardInput(
                        `new-phone-${organization.id}`,
                        "মোবাইল",
                        organization.phone,
                        (event) =>
                          handleNewOrganizationChange(
                            organization.id,
                            "phone",
                            event.target.value
                          ),
                        { className: "font-bengali" }
                      )}
                    </div>

                    <div className="flex-1 min-w-35">
                      {renderStandardInput(
                        `new-email-${organization.id}`,
                        "ইমেইল",
                        organization.email,
                        (event) =>
                          handleNewOrganizationChange(
                            organization.id,
                            "email",
                            event.target.value
                          ),
                        { type: "email", className: "font-bengali" }
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    title="ফিল্ড মুছে ফেলুন"
                    onClick={() =>
                      handleRemoveOrganizationField(
                        organization.id
                      )
                    }
                    className="mt-2"
                  >
                    <Trash2 />
                  </button>
                </div>
              )
            )}

            <button
              type="button"
              onClick={
                handleAddOrganizationField
              }
              className="w-full"
              title="আরো সংগঠন যোগ করুন"
            >
              <Plus />
            </button>
          </div>
        )}

      {groupedOrganizations.length ===
        0 ? (
        <div className="py-4 font-bengali text-stone-500 text-center">
          কোনো সংগঠন পাওয়া যায়নি।
        </div>
      ) : (
        groupedOrganizations.map(
          (organization) => (
            <div
              key={
                organization.organization
              }
              className="mb-6"
            >
              <div className="mb-2 font-bengali font-bold text-md">
                {
                  organization.organization
                }
              </div>

              <div className="gap-2 grid grid-cols-[minmax(0,2.6fr)_minmax(0,1.2fr)_minmax(0,2fr)] w-full">
                {renderStandardInput(
                  `address-${organization.organization}`,
                  "ঠিকানা",
                  organization.address,
                  (event) =>
                    handleFieldChange(
                      organization.organization,
                      "address",
                      event.target.value
                    ),
                  { readOnly: !isEditable, className: "font-bengali" }
                )}

                {renderStandardInput(
                  `phone-${organization.organization}`,
                  "মোবাইল",
                  organization.phone,
                  (event) =>
                    handleFieldChange(
                      organization.organization,
                      "phone",
                      event.target.value
                    ),
                  { readOnly: !isEditable, className: "font-bengali" }
                )}

                {renderStandardInput(
                  `email-${organization.organization}`,
                  "ইমেইল",
                  organization.email,
                  (event) =>
                    handleFieldChange(
                      organization.organization,
                      "email",
                      event.target.value
                    ),
                  { type: "email", readOnly: !isEditable, className: "font-bengali" }
                )}
              </div>

              {isEditable && (
                <button
                  type="button"
                  title="সংগঠন মুছে ফেলুন"
                  onClick={() =>
                    handleRemoveOrganization(
                      organization.organization
                    )
                  }
                  className="mt-2"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          )
        )
      )}

      <div className="absolute flex justify-end gap-0.5">
        <button
          type="button"
          onClick={
            handleToggleEdit
          }
          title={
            isEditable
              ? "দর্শন মোড"
              : "পরিবর্তন মোড"
          }
        >
          {isEditable ? (
            <Lock />
          ) : (
            <Pencil />
          )}
        </button>

        {isEditable && (
          <>
            <button
              type="button"
              onClick={
                handleDiscard
              }
              title="অপরিবর্তিত রাখুন"
            >
              <Trash2 />
            </button>

            <button
              type="button"
              onClick={
                handleSave
              }
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