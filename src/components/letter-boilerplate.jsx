import React, { useState, useEffect } from "react";
import FlagSource from "../assets/flag.svg";
import FlaggSource from "../assets/flagg.webp";
import MinarSource from "../assets/minar.png";
import { loadJsonDataFile } from "../lib/letterUtils";

// A4 dimensions used by the preview structure.
// Kept identical to report-boilerplate so both boilerplates render at the
// exact same physical page height/width.
const A4_HEIGHT_MM = 297;

export default function Boilerplate({
  formValues = {},
  isAttachment = false,
  attachmentData = {},
  previewScale = 1,
  pageRef = null
}) {
  const [wherebouts, setWherebouts] = useState({});

  useEffect(() => {
    const loadData = async () => {
      try {
        setWherebouts(await loadJsonDataFile("jamaat.json", {}));
      } catch (err) {
        console.error("Failed to load JSON data files from filesystem:", err);
      }
    };

    loadData();
  }, []);

  const sender = formValues.sender || "শাহ নাদিম আহমদ";
  const senderTitle = formValues.senderTitle || "সেক্রেটারি উমুমী";
  const senderDepartment =
    formValues.senderDepartment || "মজলিস আতফালুল আহমদীয়া";
  const senderJamaat = formValues.senderJamaat || "নারায়ণগঞ্জ";

  const senderPrefix = formValues.senderPrefix || "মআআনা";
  const fyStart = formValues.fyStart || "২০২৫";
  const fyEnd = formValues.fyEnd || "২৬";
  const department = formValues.department || "উমুমী";
  const letterNo = formValues.letterNo || "০১";
  const serialNo = formValues.serialNo || "";
  const senderField = formValues.senderField || "";

  const date = formValues.date || "১০.০৭.২০২৬";
  const subject = formValues.subject || "তালিমী ক্লাসের রিপোর্ট প্রেরণ প্রসঙ্গে";

  const receiverTitle = formValues.receiverTitle || "সদর";
  const receiverDepartment =
    formValues.receiverDepartment || "মজলিস খোদ্দামুল আহমদীয়া";
  const receiverJamaat = formValues.receiverJamaat || "বাংলাদেশ";
  const receiverField = formValues.receiverField || "";

  const onulipi = formValues.onulipi || [];
  const senderReach = formValues.senderReach || "স্থানীয়";

  const Flag =
    senderDepartment === "আহমদীয়া মুসলিম জামা'ত"
      ? FlaggSource
      : FlagSource;
  const Minar = MinarSource || "";

  const { greeting, farewell, quote } = formValues.cosmetics || {
    greeting: "",
    farewell: "",
    quote: { text: "", author: "" }
  };

  const info =
    wherebouts?.[senderReach]?.[senderJamaat]?.[senderDepartment] ?? {
      address: "",
      phone: "",
      email: ""
    };

  return (
    <div
      className="ml-1 print:ml-0"
      style={{
        height: `calc(${A4_HEIGHT_MM * previewScale}mm + 16px)`,
      }}
    >
      <div
        ref={pageRef}
        style={{
          transform: `scale(${previewScale})`,
          transformOrigin: "top left",
        }}
        className="box-border relative bg-white w-[210mm] min-h-[297mm] overflow-hidden print:transform-none origin-top-left letter-page"
      >
        <div className="w-full">
          <div className="bg-gray-200 forced-color-adjust-none pt-2 pb-2 w-full text-center">
            <div className="font-ar text-4xl">9</div>
            <div className="flex flex-row justify-center items-center gap-3">
              <div className="flex justify-center items-center bg-gray-300 rounded-4xl outline-1 w-10 h-10 overflow-hidden">
                {Flag ? (
                  <img className="flag" src={Flag} alt="Flag" />
                ) : (
                  <span className="text-xs">পতাকা</span>
                )}
              </div>
              <div className="font-bengali text-[38px] leading-0">
                {senderDepartment}, {senderJamaat}
              </div>
            </div>
            <div className="flex flex-row justify-center items-center pt-1 pb-2 font-bengali text-মদ">
              {[info.address, info.phone, info.email]
                .filter(Boolean)
                .join(" • ")}
            </div>
          </div>
          <div className="bg-linear-to-r from-black via-white to-black w-full h-1"></div>
        </div>

        {Minar && (
          <img
            className="bottom-10 fixed opacity-25"
            src={Minar}
            alt="Minar"
          />
        )}

        <div className="fixed mt-37 mr-12 ml-12 w-[95%] h-228 font-bengali text-black text-sm">
          <div className="flex flex-col justify-between h-full">
            <div className="h-full">
              <div className="flex flex-row justify-between">
                <div>
                  {senderPrefix}/{department}/{fyStart}-{fyEnd}/{letterNo}
                  {serialNo && ` (${serialNo})`}
                </div>
                <div>তারিখঃ {date}</div>
              </div>

              {!isAttachment ? (
                /* --- Normal Letter View Mode --- */
                <>
                  <div className="pt-3">মোহতরম</div>
                  <div>{receiverTitle} সাহেব</div>
                  {receiverField && receiverField !== "নেই" && (
                    <div>{receiverField}</div>
                  )}
                  <div>
                    {receiverDepartment}, {receiverJamaat}
                  </div>
                  <div>
                    বিষয়ঃ{" "}
                    <b>
                      <u>{subject}।</u>
                    </b>
                  </div>
                  <div>মোকাররম</div>
                  <div className="mb-1 whitespace-pre-wrap">{greeting}</div>
                  <div dangerouslySetInnerHTML={{ __html: formValues.body }} />
                  <div className="mt-1 whitespace-pre-wrap">{farewell}</div>
                  <div>ওয়াসসালাম</div>
                  <div>খাকসার</div>
                  <div>{sender}</div>
                  <div>{senderTitle}</div>
                  {senderField && senderField !== "নেই" && (
                    <div>{senderField}</div>
                  )}
                  <div>
                    {senderDepartment}, {senderJamaat}
                  </div>
                </>
              ) : (
                /* --- Attachment View Mode --- */
                <div className="flex flex-col pt-3">
                  <div
                    dangerouslySetInnerHTML={{ __html: attachmentData.body }}
                  />
                </div>
              )}
            </div>

            <div>
              {!isAttachment && onulipi.length > 0 && (
                <>
                  <div className="bottom-0 mt-4">
                    <u>অনুলিপিঃ</u>
                  </div>
                  {[...onulipi]
                    .sort((a, b) => {
                      const aOffice = a.holder === "অফিস কপি";
                      const bOffice = b.holder === "অফিস কপি";

                      if (aOffice && !bOffice) return 1;
                      if (!aOffice && bOffice) return -1;
                      return 0;
                    })
                    .map((entry, index) => (
                      <div key={index}>
                        {index + 1}. {entry.holder || "অনুলিপি প্রাপক"}
                        {entry.department && `, ${entry.department}`}
                        {entry.jamaat && `, ${entry.jamaat}`}।
                      </div>
                    ))}
                </>
              )}
              {isAttachment && attachmentData.annexCode && (
                <div className="text-right">{attachmentData.annexCode}</div>
              )}
            </div>
          </div>
        </div>
        <div className="bottom-0 flex flex-row justify-center items-center gap-2 bg-black w-full h-10 font-bengali text-white text-center">
          <div className="text-md">{quote.text}</div>
          <div className="text-sm">{quote.author}</div>
        </div>
      </div>
    </div>
  );
}