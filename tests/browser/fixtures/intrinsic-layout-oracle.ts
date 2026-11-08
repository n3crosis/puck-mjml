/**
 * Independent, hand-authored HTML oracle. No renderer, serializer, or model
 * traversal participates in its table/cell/image layout. Its only dynamic
 * values are the viewport breakpoint and repeated generic mobile mode.
 */
export function intrinsicLayoutOracle(breakpoint = 560) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body { margin:0; }
    .email { max-width:600px; margin:0 auto; }
    .row { padding:0; }
    table { border-collapse:collapse; border-spacing:0; table-layout:auto; width:100%; max-width:100%; }
    td { padding:8px; vertical-align:middle; }
    .text { padding:0; text-align:left; }
    .text > div { color:#222222; font:400 14px/20px Arial,sans-serif; letter-spacing:0; }
    p { margin:0; }
    .image { padding:0; text-align:left; font-size:0; line-height:0; }
    .image a { display:block; }
    img { display:block; box-sizing:content-box; border:0; border-radius:0; width:100%; max-width:100%; height:auto; }
    .nested table, .natural table { width:auto; }
    .nested td, .natural td, .narrow-host td { padding:0; }
    .nested .icon-cell { padding:0 8px 0 0; }
    .nested img { width:16px; }
    .requested img { width:64px; }
    .narrow-host { width:32px; }
    @media (max-width:${breakpoint - 1}px) {
      .mode-stack > table, .mode-stack > table > tbody, .mode-stack > table > tbody > tr { display:block; width:100%; }
      .mode-stack > table > tbody > tr > td { display:block; box-sizing:border-box; width:100%; min-width:0; max-width:100%; }
      .mode-two > table, .mode-two > table > tbody, .mode-two > table > tbody > tr { display:block; width:100%; }
      .mode-two > table > tbody > tr { font-size:0; }
      .mode-two > table > tbody > tr > td { display:inline-block; box-sizing:border-box; width:50%; min-width:0; max-width:100%; }
    }
  </style></head><body><main class="email">
    ${["stack", "two", "keep"]
      .map(
        (mode) => `
      <div class="row mode-${mode}"><table role="presentation" cellpadding="0" cellspacing="0"><tbody><tr>
        <td class="${mode}-a"><div class="text ${mode}-short"><div><p>Short</p></div></div></td>
        <td class="${mode}-b"><div class="text ${mode}-long"><div><p>A much longer content-driven label</p></div></div></td>
        <td class="${mode}-c"><div class="row nested ${mode}-nested"><table role="presentation" cellpadding="0" cellspacing="0"><tbody><tr>
          <td class="icon-cell ${mode}-icon-cell"><div class="image ${mode}-icon"><a><img src="https://example.com/intrinsic-natural-24.png" alt="${mode}-icon" width="16"></a></div></td>
          <td class="${mode}-label-cell"><div class="text ${mode}-label"><div><p>Icon label</p></div></div></td>
        </tr></tbody></table></div></td>
        <td class="${mode}-d"><div class="image ${mode}-auto-image"><a><img src="https://example.com/intrinsic-natural-96.png" alt="${mode}-auto-image"></a></div></td>
      </tr></tbody></table></div>`,
      )
      .join("")}
    <div class="row natural requested width-requested"><table role="presentation" cellpadding="0" cellspacing="0"><tbody><tr>
      <td class="requested-cell"><div class="image requested-image"><a><img src="https://example.com/intrinsic-natural-24.png" alt="requested-image" width="64"></a></div></td>
    </tr></tbody></table></div>
    <div class="row natural width-omitted"><table role="presentation" cellpadding="0" cellspacing="0"><tbody><tr>
      <td class="omitted-cell"><div class="image omitted-image"><a><img src="https://example.com/intrinsic-natural-24.png" alt="omitted-image"></a></div></td>
    </tr></tbody></table></div>
    <div class="narrow-host"><div class="row requested width-constrained"><table role="presentation" cellpadding="0" cellspacing="0"><tbody><tr>
      <td class="constrained-cell"><div class="image constrained-image"><a><img src="https://example.com/intrinsic-natural-24.png" alt="constrained-image" width="64"></a></div></td>
    </tr></tbody></table></div></div>
  </main></body></html>`;
}
