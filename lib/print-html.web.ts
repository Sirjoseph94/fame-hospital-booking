/**
 * Web: expo-print only prints the current page, so render the HTML in a
 * hidden iframe and print that. The frame is removed after printing
 * (`afterprint`), with a long fallback for browsers that don't fire it.
 */
export async function printHtml(html: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error("Printing isn't available in this browser.");
  }
  doc.open();
  doc.write(html);
  doc.close();
  let removed = false;
  const remove = () => {
    if (!removed) {
      removed = true;
      frame.remove();
    }
  };
  win.addEventListener("afterprint", () => setTimeout(remove, 0));
  setTimeout(remove, 5 * 60_000);
  // Give the browser a moment to lay out the poster (and its SVG).
  await new Promise((resolve) => setTimeout(resolve, 250));
  win.focus();
  win.print();
}
