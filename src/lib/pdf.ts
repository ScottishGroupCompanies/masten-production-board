function escapePdf(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function simplePdf(title: string, lines: string[]): Buffer {
  const commands = [
    "BT",
    "/F1 16 Tf",
    "54 740 Td",
    `(${escapePdf(title)}) Tj`,
    "ET",
    "BT",
    "/F1 10 Tf",
    "54 716 Td",
    "(Masten Fine Framing  ·  Greenwood Village  ·  shop copy) Tj",
    "ET",
  ];
  let y = 684;
  for (const line of lines) {
    if (y < 64) break;
    const text = line.length > 95 ? `${line.slice(0, 92)}...` : line;
    commands.push("BT", "/F1 11 Tf", `54 ${y} Td`, `(${escapePdf(text)}) Tj`, "ET");
    y -= 16;
  }
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "utf8");
}

export function artSvg(title: string, subtitle: string, hue: number): Buffer {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="#efe6d6"/>
  <rect x="64" y="56" width="1072" height="788" fill="#f7f1e6" stroke="#1c2b26" stroke-width="16"/>
  <rect x="108" y="100" width="984" height="640" fill="hsl(${hue} 32% 76%)"/>
  <circle cx="390" cy="390" r="140" fill="hsl(${hue} 38% 38%)"/>
  <rect x="560" y="250" width="400" height="250" fill="hsl(${(hue + 36) % 360} 30% 32%)" opacity="0.9"/>
  <path d="M140 680 C 280 560, 460 700, 680 600 S 980 520, 1060 680" fill="none" stroke="#f4efe4" stroke-width="18"/>
  <text x="108" y="790" font-family="Georgia, serif" font-size="32" fill="#1c2b26">${escape(title)}</text>
  <text x="108" y="830" font-family="Georgia, serif" font-size="20" fill="#5c564c">${escape(subtitle)}</text>
</svg>`;
  return Buffer.from(svg, "utf8");
}
