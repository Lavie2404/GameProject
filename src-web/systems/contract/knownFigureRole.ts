/**
 * "Thân phận / Vai trò" for a character who already exists.
 *
 * Reported 2026-09-23: with the name "Triệu Vân" in a Tam Quốc world, the
 * suggest button invented "Mật sứ ẩn danh từ Thường Sơn, che giấu thân phận
 * thật..." - a brand-new identity for a figure whose identity is a matter of
 * record (Thục Hán general, courtesy name Tử Long, from Thường Sơn).
 *
 * The three prompts that fill the role field ("Định Hình" quick-create, the
 * per-field suggest button, "Điền Tự Động") shared no rule about this, so
 * each was free to be creative. They now share this one.
 *
 * Pure module: prompt text only.
 */

/**
 * The rule, as a prompt bullet block. Applies to the role field first, and to
 * backstory/appearance by extension (the same figure keeps the same past).
 */
export const KNOWN_FIGURE_ROLE_RULE = [
  'QUY TẮC NHÂN VẬT CÓ SẴN (ÁP DỤNG TRƯỚC MỌI SÁNG TẠO):',
  '- NẾU tên nhân vật (xét cùng chủ đề/bối cảnh thế giới) trùng với một nhân vật CÓ THẬT trong lịch sử ' +
    'hoặc một nhân vật ĐÃ CÓ trong tác phẩm gốc (tiểu thuyết, phim, truyện tranh, game...), thì ' +
    '"Thân phận / Vai trò" PHẢI là đúng thân phận, chức vụ, xuất thân, danh xưng ĐÃ ĐƯỢC BIẾT của nhân vật đó. ' +
    'KHÔNG bịa thân phận mới, KHÔNG biến họ thành "ẩn danh", "mật sứ", "lưu vong", "che giấu thân phận" hay bất kỳ vai trò nào nguyên tác không có.',
  '- VÍ DỤ ĐÚNG: tên "Triệu Vân", thế giới Tam Quốc → "Tướng lĩnh Thục Hán, tự Tử Long, người Thường Sơn, Chân Định". ' +
    'VÍ DỤ SAI: "Mật sứ ẩn danh từ Thường Sơn, che giấu thân phận thật để âm thầm tìm kiếm minh chủ".',
  '- Tiểu sử và ngoại hình của nhân vật có sẵn cũng phải bám theo nguyên tác/lịch sử, chỉ được thêm chi tiết không mâu thuẫn.',
  '- CHỈ KHI tên không trùng với nhân vật nào đã biết thì mới sáng tạo thân phận mới.',
].join('\n');

/** Mission text for the per-field suggest button and "Điền Tự Động". */
export const CHARACTER_ROLE_MISSION =
  'xác định MỘT thân phận/vai trò ngắn gọn: dùng đúng thân phận đã biết nếu nhân vật có sẵn trong lịch sử/nguyên tác ' +
  '(xem QUY TẮC NHÂN VẬT CÓ SẴN); chỉ sáng tạo (VD: Đệ tử mồ côi, Sát thủ lưu vong...) khi nhân vật hoàn toàn mới';

/** True when a prompt already carries the rule (so it is not added twice). */
export function promptHasKnownFigureRule(text: unknown): boolean {
  return typeof text === 'string' && text.includes('QUY TẮC NHÂN VẬT CÓ SẴN');
}
