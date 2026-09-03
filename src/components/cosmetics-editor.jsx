import React, { useEffect, useState } from "react";
import {
  Pencil,
  Lock,
  Save,
  Trash2,
  Plus,
} from "lucide-react";
import { loadJsonDataFile, saveJsonDataFile, clone } from "../lib/letterUtils";

const createEmptyQuote = () => ({
  text: "",
  author: "",
});

const normalizeCosmetics = (value) => ({
  quote: Array.isArray(value?.quote)
    ? value.quote
    : [],
  greetings: Array.isArray(value?.greetings)
    ? value.greetings
    : [],
  farewell: Array.isArray(value?.farewell)
    ? value.farewell
    : [],
});

export default function CosmeticsEditor() {
  const [data, setData] = useState({
    quote: [],
    greetings: [],
    farewell: [],
  });

  const [isEditable, setIsEditable] =
    useState(false);

  const [newGreeting, setNewGreeting] =
    useState("");

  const [newFarewell, setNewFarewell] =
    useState("");

  const [newQuotes, setNewQuotes] =
    useState([createEmptyQuote()]);

  const loadCosmeticsData = async () => {
    const content = await loadJsonDataFile(
      "cosmetics.json",
      {}
    );

    setData(normalizeCosmetics(content));
  };

  useEffect(() => {
    loadCosmeticsData();
  }, []);

  const handleToggleEdit = () => {
    setIsEditable(
      (previous) => !previous
    );
  };

  const handleGreetingChange = (
    index,
    value
  ) => {
    if (!isEditable) return;

    const updated = clone(data);

    updated.greetings[index] =
      value;

    setData(updated);
  };

  const handleFarewellChange = (
    index,
    value
  ) => {
    if (!isEditable) return;

    const updated = clone(data);

    updated.farewell[index] =
      value;

    setData(updated);
  };

  const handleQuoteChange = (
    index,
    field,
    value
  ) => {
    if (!isEditable) return;

    const updated = clone(data);

    if (!updated.quote[index]) {
      updated.quote[index] =
        createEmptyQuote();
    }

    updated.quote[index][field] =
      value;

    setData(updated);
  };

  const handleRemoveGreeting = (
    index
  ) => {
    if (!isEditable) return;

    const updated = clone(data);

    updated.greetings =
      updated.greetings.filter(
        (_, itemIndex) =>
          itemIndex !== index
      );

    setData(updated);
  };

  const handleRemoveFarewell = (
    index
  ) => {
    if (!isEditable) return;

    const updated = clone(data);

    updated.farewell =
      updated.farewell.filter(
        (_, itemIndex) =>
          itemIndex !== index
      );

    setData(updated);
  };

  const handleRemoveQuote = (
    index
  ) => {
    if (!isEditable) return;

    const updated = clone(data);

    updated.quote =
      updated.quote.filter(
        (_, itemIndex) =>
          itemIndex !== index
      );

    setData(updated);
  };

  const handleAddNewQuoteField =
    () => {
      setNewQuotes((previous) => [
        ...previous,
        createEmptyQuote(),
      ]);
    };

  const handleRemoveNewQuoteField =
    (index) => {
      setNewQuotes((previous) =>
        previous.filter(
          (_, itemIndex) =>
            itemIndex !== index
        )
      );
    };

  const handleNewQuoteChange = (
    index,
    field,
    value
  ) => {
    setNewQuotes((previous) =>
      previous.map(
        (quote, quoteIndex) =>
          quoteIndex === index
            ? {
              ...quote,
              [field]: value,
            }
            : quote
      )
    );
  };

  const handleAddGreeting = () => {
    const value =
      newGreeting.trim();

    if (!value) return;

    setData((previous) => ({
      ...previous,
      greetings: [
        ...previous.greetings,
        value,
      ],
    }));

    setNewGreeting("");
  };

  const handleAddFarewell = () => {
    const value =
      newFarewell.trim();

    if (!value) return;

    setData((previous) => ({
      ...previous,
      farewell: [
        ...previous.farewell,
        value,
      ],
    }));

    setNewFarewell("");
  };

  const handleSave = async () => {
    const updated = clone(data);

    newQuotes.forEach((quote) => {
      const text =
        quote.text.trim();

      if (!text) return;

      updated.quote.push({
        text,
        author:
          quote.author.trim(),
      });
    });

    try {
      await saveJsonDataFile({
        invokeCommand: "save_cosmetics",
        invokeArgKey: "cosmeticsData",
        data: updated,
        fileName: "cosmetics.json",
      });

      setData(updated);

      setNewQuotes([
        createEmptyQuote(),
      ]);

      alert(
        "Cosmetics dataset updated successfully!"
      );
    } catch (error) {
      console.error(
        "Failed to save cosmetics.json:",
        error
      );

      alert(
        "Failed to save changes to file: " +
        error
      );
    }
  };

  const handleDiscard = () => {
    loadCosmeticsData();

    setNewGreeting("");
    setNewFarewell("");
    setNewQuotes([
      createEmptyQuote(),
    ]);

    setIsEditable(false);
  };

  return (
    <form
      onSubmit={(event) =>
        event.preventDefault()
      }
    >
      <div className="separator">
        সম্ভাষণ
      </div>

      {data.greetings.length ===
        0 ? (
        <div className="py-4 font-bengali text-stone-500 text-center">
          কোনো সম্ভাষণ পাওয়া যায়নি।
        </div>
      ) : (
        data.greetings.map(
          (greeting, index) => (
            <div
              key={index}
              className="mb-2"
            >
              <div className="flex items-center gap-2">
                <input
                  name={`greeting-${index}`}
                  title="সম্ভাষণ"
                  placeholder="সম্ভাষণ"
                  value={greeting}
                  readOnly={
                    !isEditable
                  }
                  onChange={(event) =>
                    handleGreetingChange(
                      index,
                      event.target
                        .value
                    )
                  }
                  className="w-full font-bengali"
                />

                {isEditable && (
                  <button
                    type="button"
                    title="সম্ভাষণ মুছে ফেলুন"
                    onClick={() =>
                      handleRemoveGreeting(
                        index
                      )
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          )
        )
      )}

      {isEditable && (
        <div className="flex items-center gap-2 mb-6">
          <input
            name="new-greeting"
            title="নতুন সম্ভাষণ"
            placeholder="নতুন সম্ভাষণ"
            value={newGreeting}
            onChange={(event) =>
              setNewGreeting(
                event.target.value
              )
            }
            className="w-full font-bengali"
          />

          <button
            type="button"
            title="সম্ভাষণ যোগ করুন"
            onClick={
              handleAddGreeting
            }
          >
            <Plus />
          </button>
        </div>
      )}

      <div className="separator">
        বিদায় সম্ভাষণ
      </div>

      {data.farewell.length ===
        0 ? (
        <div className="py-4 font-bengali text-stone-500 text-center">
          কোনো বিদায় সম্ভাষণ পাওয়া যায়নি।
        </div>
      ) : (
        data.farewell.map(
          (farewell, index) => (
            <div
              key={index}
              className="mb-2"
            >
              <div className="flex items-center gap-2">
                <input
                  name={`farewell-${index}`}
                  title="বিদায় সম্ভাষণ"
                  placeholder="বিদায় সম্ভাষণ"
                  value={farewell}
                  readOnly={
                    !isEditable
                  }
                  onChange={(event) =>
                    handleFarewellChange(
                      index,
                      event.target
                        .value
                    )
                  }
                  className="w-full font-bengali"
                />

                {isEditable && (
                  <button
                    type="button"
                    title="বিদায় সম্ভাষণ মুছে ফেলুন"
                    onClick={() =>
                      handleRemoveFarewell(
                        index
                      )
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          )
        )
      )}

      {isEditable && (
        <div className="flex items-center gap-2 mb-6">
          <input
            name="new-farewell"
            title="নতুন বিদায় সম্ভাষণ"
            placeholder="নতুন বিদায় সম্ভাষণ"
            value={newFarewell}
            onChange={(event) =>
              setNewFarewell(
                event.target.value
              )
            }
            className="w-full font-bengali"
          />

          <button
            type="button"
            title="বিদায় সম্ভাষণ যোগ করুন"
            onClick={
              handleAddFarewell
            }
          >
            <Plus />
          </button>
        </div>
      )}

      <div className="separator">
        উদ্ধৃতি
      </div>

      {isEditable && (
        <div className="mb-6 pb-4 border-stone-200 border-b">
          <span className="font-bengali font-semibold text-md">
            নতুন উদ্ধৃতি যোগ করুন
          </span>

          {newQuotes.map(
            (quote, index) => (
              <div
                key={index}
                className="mb-4"
              >
                <input
                  name={`new-quote-text-${index}`}
                  title="উদ্ধৃতি"
                  placeholder="উদ্ধৃতি"
                  value={quote.text}
                  onChange={(event) =>
                    handleNewQuoteChange(
                      index,
                      "text",
                      event.target.value
                    )
                  }
                  className="mb-2 w-full font-bengali"
                />

                <div className="flex items-center gap-2">
                  <input
                    name={`new-quote-author-${index}`}
                    title="লেখক"
                    placeholder="লেখক"
                    value={quote.author}
                    onChange={(event) =>
                      handleNewQuoteChange(
                        index,
                        "author",
                        event.target.value
                      )
                    }
                    className="w-full font-bengali"
                  />

                  {newQuotes.length >
                    1 && (
                      <button
                        type="button"
                        title="ফিল্ড মুছে ফেলুন"
                        onClick={() =>
                          handleRemoveNewQuoteField(
                            index
                          )
                        }
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
              handleAddNewQuoteField
            }
            className="w-full"
            title="আরো উদ্ধৃতি যোগ করুন"
          >
            <Plus />
          </button>
        </div>
      )}

      {data.quote.length ===
        0 ? (
        <div className="py-4 font-bengali text-stone-500 text-center">
          কোনো উদ্ধৃতি পাওয়া যায়নি।
        </div>
      ) : (
        data.quote.map(
          (quote, index) => (
            <div
              key={index}
              className="mb-4"
            >
              <input
                name={`quote-text-${index}`}
                title="উদ্ধৃতি"
                placeholder="উদ্ধৃতি"
                value={
                  quote.text || ""
                }
                readOnly={
                  !isEditable
                }
                onChange={(event) =>
                  handleQuoteChange(
                    index,
                    "text",
                    event.target.value
                  )
                }
                className="mb-2 w-full font-bengali"
              />

              <div className="flex items-center gap-2">
                <input
                  name={`quote-author-${index}`}
                  title="লেখক"
                  placeholder="লেখক"
                  value={
                    quote.author || ""
                  }
                  readOnly={
                    !isEditable
                  }
                  onChange={(event) =>
                    handleQuoteChange(
                      index,
                      "author",
                      event.target.value
                    )
                  }
                  className="w-full font-bengali"
                />

                {isEditable && (
                  <button
                    type="button"
                    title="উদ্ধৃতি মুছে ফেলুন"
                    onClick={() =>
                      handleRemoveQuote(
                        index
                      )
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
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