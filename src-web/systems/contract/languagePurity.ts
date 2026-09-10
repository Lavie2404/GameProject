/**
 * Rule 1.5 — "CHỈ VIẾT BẰNG CHỮ QUỐC NGỮ": no non-Vietnamese script may appear
 * in AI-authored text, and no whole English word either.
 *
 * The rule already existed, but it lived inline in ONE prompt (the narration
 * block built by the useMemo in App.tsx), so it only ever constrained
 * narration, dialogue and the four suggested actions. Every prompt that asks
 * the model for Vietnamese prose inside a JSON field — NPC Appearance /
 * Backstory / Personality, item and skill descriptions, quest text, the
 * world-setup character fields — carried no language constraint at all. That
 * is how "Dung貌" reached the character sheet (reported 2026-09-10): a Han
 * character glued to a Vietnamese syllable, exactly the defect the rule's own
 * "tâm念" example describes, produced by a prompt the rule never reached.
 *
 * Only the SCOPE sentence differs between the two variants; the substance,
 * the worked examples and the self-check are shared, so the rule can no
 * longer drift between prompts.
 *
 * NOTE: the `//` at the start of each line is prompt bullet formatting, not a
 * code comment — these strings are pasted into prompt text verbatim.
 */

export const RULE_TITLE =
  "// 1.5. CHỈ VIẾT BẰNG CHỮ QUỐC NGỮ (TUYỆT ĐỐI CẤM CHỮ VIẾT NGOÀI TIẾNG VIỆT):";

const RULE_SCOPE_PREFIX = "//    - ";

/** Everything after the scope phrase: shared by every variant, verbatim. */
const RULE_BODY = [
  "//    - Muốn diễn đạt khái niệm gốc Hán (võ công, công pháp, danh xưng, tâm pháp...), BẮT BUỘC dùng từ Hán Việt đã phiên âm sang chữ Quốc ngữ (VD: \"niệm\", \"chiêu thức\", \"tâm ma\"), TUYỆT ĐỐI KHÔNG viết trực tiếp ký tự Hán gốc (VD: 念, 心, 氣).",
  "//    - VÍ DỤ SAI (lẫn tiếng Nga): \"Vận dụng toàn bộ sức mạnh физи thể chất lướt tới áp sát...\" — \"физи\" là ký tự ngoại lai vô nghĩa trong câu, TUYỆT ĐỐI không được xuất hiện.",
  "//    - VÍ DỤ SAI (lẫn chữ Hán thay vì Hán Việt): \"Ngươi tâm念 vừa động, chuôi thần binh... hiện ra\" — phải viết trọn \"niệm\" bằng chữ Quốc ngữ: \"Ngươi tâm niệm vừa động\".",
  "//    - VÍ DỤ SAI (lẫn nguyên từ tiếng Anh): \"...bọc giáp sáng quắc under sự dẫn dắt của...\" (phải viết \"dưới sự dẫn dắt của\"); \"...màn kịch của mình đã đến lúc thu hạ curtains.\" (phải viết trọn ý bằng tiếng Việt, VD \"đã đến lúc hạ màn.\", KHÔNG được giữ từ \"curtains\"); \"Supple nhưng lại có chút vết chai mỏng ở lòng bàn tay\" (từ tính từ tiếng Anh \"supple\" đứng đầu câu được viết hoa nên trông như tên riêng — vẫn là lỗi, phải viết \"Mềm mại nhưng lại có chút vết chai mỏng ở lòng bàn tay\"). ĐẶC BIỆT CẢNH GIÁC với các tính từ tả xúc giác/hình thể (supple, smooth, soft, firm, delicate, graceful...) — chúng hay lọt vào đầu câu miêu tả cơ thể.",
  "//    - VÍ DỤ ĐÚNG: \"Vận dụng toàn bộ sức mạnh thể chất lướt tới áp sát...\", \"Ngươi tâm niệm vừa động, chuôi thần binh... hiện ra\", \"...bọc giáp sáng quắc dưới sự dẫn dắt của...\", \"...màn kịch của mình đã đến lúc hạ màn.\", \"Mềm mại nhưng lại có chút vết chai mỏng ở lòng bàn tay\".",
  "//    - TỰ KIỂM TRA BẮT BUỘC TRƯỚC KHI TRẢ VỀ PHẢN HỒI: rà lại toàn bộ văn bản một lượt, kể cả những từ trông \"vô hại\" xen giữa câu tiếng Việt; nếu phát hiện bất kỳ ký tự/từ nào không phải chữ Quốc ngữ (kể cả một từ tiếng Anh thông dụng) hoặc dấu câu thông thường, PHẢI xóa hoặc dịch hẳn sang tiếng Việt trước khi hoàn tất.",
].join('\n');

/** Scope wording for the narration/dialogue/suggestions prompt. */
export const SCOPE_NARRATION = "Toàn bộ văn tường thuật, hội thoại, và 4 gợi ý hành động";

/** Scope wording for prompts whose output is JSON with Vietnamese prose fields. */
export const SCOPE_JSON_FIELDS =
  'Toàn bộ nội dung văn bản của MỌI trường trong JSON trả về (mô tả, tiểu sử, tính cách, ngoại hình, tên gọi...)';

const RULE_SCOPE_TAIL = " PHẢI 100% bằng chữ Quốc ngữ (bảng chữ Latin có dấu tiếng Việt). TUYỆT ĐỐI KHÔNG được để lẫn bất kỳ ký tự/từ nào của ngôn ngữ khác vào giữa câu tiếng Việt — kể cả chỉ một chữ Hán/Kana/Hangul/Kirin (Nga) đơn lẻ, dù chỉ một âm tiết, VÀ kể cả một TỪ TIẾNG ANH nguyên vẹn (dù cùng dùng chữ Latin như tiếng Việt) — mọi từ, kể cả từ đơn giản/thông dụng, PHẢI dịch hẳn sang tiếng Việt, không được giữ nguyên văn gốc tiếng Anh.";

/** Build the rule for a given scope. */
export function quocNguOnlyRule(scope: string): string {
  return [RULE_TITLE, RULE_SCOPE_PREFIX + scope + RULE_SCOPE_TAIL, RULE_BODY].join('\n');
}

/** Exactly the text that has always been in the narration prompt. */
export const QUOC_NGU_ONLY_NARRATION = quocNguOnlyRule(SCOPE_NARRATION);

/** Same rule, aimed at structured JSON output. */
export const QUOC_NGU_ONLY_JSON_FIELDS = quocNguOnlyRule(SCOPE_JSON_FIELDS);

/** Scope wording for a prompt whose answer is free text rather than JSON. */
export const SCOPE_ANY_OUTPUT = 'Toàn bộ nội dung văn bản ngươi trả về';

/** Same rule, for free-text answers. */
export const QUOC_NGU_ONLY_ANY_OUTPUT = quocNguOnlyRule(SCOPE_ANY_OUTPUT);

/** True when a prompt already carries this rule, so it is not added twice. */
export function promptHasQuocNguRule(text: unknown): boolean {
  return typeof text === 'string' && text.includes(RULE_TITLE);
}
