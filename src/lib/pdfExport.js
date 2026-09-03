import { invoke } from "@tauri-apps/api/core";
import { toPng } from "html-to-image";

/*
 * Shared PDF export pipeline, previously duplicated (with small but real
 * inconsistencies) across letter-report.jsx, letter-database.jsx (twice),
 * report.jsx, and report-database.jsx (twice):
 *   - capturePageImage: renders a page element to a PNG data URL.
 *   - addImageAsPdfPage: adds that image to a jsPDF document, letterboxing
 *     (and centering) it if its aspect ratio doesn't exactly match the page.
 *   - buildPdfFromElements: full pipeline from an array of page DOM elements
 *     to a base64 PDF string.
 *   - printPdfSilent: sends a base64 PDF straight to the OS print dialog via
 *     the Tauri backend.
 *
 * `capturePageImage` always overrides the captured node's `transform` to
 * `none`. Without this, if the page is currently shown at a scaled-down
 * on-screen preview size (e.g. a narrow editor column), the capture would
 * paint the page's content shrunk into a corner of an otherwise
 * full-size canvas — the letter/report would then look like it doesn't
 * fill the page once stretched into the PDF.
 */

/** Render a page element to a PNG data URL, ignoring any live on-screen scale transform. */
export const capturePageImage = (element) =>
  toPng(element, {
    pixelRatio: 2,
    cacheBust: true,
    width: element.offsetWidth,
    height: element.offsetHeight,
    style: {
      margin: "0",
      padding: "0",
      transform: "none",
    },
  });

/**
 * Adds `image` as a page to `pdf` (an A4-portrait jsPDF document), scaling
 * to fill the page width and, if the image is proportionally taller than
 * the page, capping it to the page height instead. Anchored top-left (not
 * centered) to match the app's existing convention.
 */
export const addImageAsPdfPage = (pdf, image, isFirstPage) => {
  if (!isFirstPage) {
    pdf.addPage();
  }

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const imageProps = pdf.getImageProperties(image);
  const imageHeight = (imageProps.height * pdfWidth) / imageProps.width;

  if (imageHeight > pdfHeight) {
    const factor = pdfHeight / imageHeight;
    const width = pdfWidth * factor;
    pdf.addImage(image, "PNG", 0, 0, width, pdfHeight);
  } else {
    pdf.addImage(image, "PNG", 0, 0, pdfWidth, imageHeight);
  }
};

/**
 * Captures each element in `elements` (in order) and assembles them into a
 * single A4-portrait jsPDF document, returning the jsPDF object itself so
 * callers can `.save()` it directly, output a data URI, etc.
 */
export const buildPdfDocument = async (elements) => {
  const valid = elements.filter(Boolean);
  if (!valid.length) throw new Error("No pages to export");

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let i = 0; i < valid.length; i++) {
    const image = await capturePageImage(valid[i]);
    addImageAsPdfPage(pdf, image, i === 0);
  }

  return pdf;
};

/**
 * Same as `buildPdfDocument`, but returns the result as a base64 string (no
 * data URL prefix) ready for `printPdfSilent` or to hand to the backend for
 * saving.
 */
export const buildPdfFromElements = async (elements) => {
  const pdf = await buildPdfDocument(elements);
  return pdf.output("datauristring").split(",")[1];
};

/** Sends a base64 PDF straight to the OS print dialog via the Tauri backend. */
export const printPdfSilent = (pdfBase64, printerName = null) =>
  invoke("print_pdf_silent", { pdfBase64, printerName });