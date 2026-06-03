/* export.js — copy/download the Mermaid SVG, either as SVG markup or as a PNG.
 *
 * The SVG lives inside a same-origin srcdoc iframe, so we can serialize it directly.
 * For PNG we rasterise via an <img> with a data: URL — no canvas taint issues because
 * the SVG itself is inline and references no cross-origin assets.
 */
(() => {
  function serializeSvg(svg) {
    const clone = svg.cloneNode(true);
    // Strip Loop's runtime-only attributes (ids that clash if reopened)
    clone.removeAttribute('aria-roledescription');
    // Ensure width/height for downstream consumers (mermaid often only sets width:100%)
    const bbox = svg.getBoundingClientRect();
    if (bbox.width && !clone.getAttribute('width')?.match(/^\d/)) clone.setAttribute('width', Math.round(bbox.width));
    if (bbox.height && !clone.getAttribute('height')) clone.setAttribute('height', Math.round(bbox.height));
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(clone);
  }

  async function copySvg(svg) {
    const xml = serializeSvg(svg);
    await navigator.clipboard.writeText(xml);
  }

  async function svgToPngBlob(svg, scale = 2) {
    const xml = serializeSvg(svg);
    const bbox = svg.getBoundingClientRect();
    const w = Math.max(1, Math.round(bbox.width * scale));
    const h = Math.max(1, Math.round(bbox.height * scale));
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = () => rej(new Error('SVG -> Image decode failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise(res => canvas.toBlob(b => res(b), 'image/png'));
  }

  async function copyPng(svg) {
    const blob = await svgToPngBlob(svg);
    if (!blob) throw new Error('PNG encode failed');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadSvg(svg, name = 'diagram.svg') {
    const xml = serializeSvg(svg);
    download(new Blob([xml], { type: 'image/svg+xml' }), name);
  }

  async function downloadPng(svg, name = 'diagram.png') {
    const blob = await svgToPngBlob(svg, 2);
    if (blob) download(blob, name);
  }

  window.__LME_export = { serializeSvg, copySvg, copyPng, downloadSvg, downloadPng };
})();
