// ============================================================================
// GAME CONFIG — file cấu hình cân bằng game, sửa xong lưu lại là áp dụng ngay
// (Vite tự hot-reload). Đây là các con số/hằng số điều khiển hành vi thật của
// game — không phải chỉ là tài liệu mô tả. Sửa số ở đây thay vì đi tìm trong
// App.tsx. Đối chiếu ý nghĩa từng mục với GAME_SETTINGS_REFERENCE.md.
//
// LƯU Ý: đây chỉ là các HẰNG SỐ (con số). Cấu trúc thuật toán (thứ tự tính,
// công thức) vẫn nằm trong App.tsx — sửa file này không đổi được LOGIC, chỉ
// đổi được CON SỐ dùng trong logic đó.
// ============================================================================

export const GAME_CONFIG = {

    // 1. CHỈ SỐ KHỞI ĐIỂM CHO NHÂN VẬT MỚI (INITIAL_STATS)
    startingStats: {
        ap: 5,
        baseHp: 2000,
        baseAtk: 200,
        baseDef: 100,
        baseSpd: 300,
        baseCr: 15,       // % tỉ lệ chí mạng gốc
        baseCdmg: 200,   // % sát thương chí mạng gốc (150 = x1.5)
        baseDmgAmp: 100,
        baseDmgRes: 100,
        baseEvasion: 100,
    },

    // 2. QUY ĐỔI 1 ĐIỂM AP THÀNH CHỈ SỐ KHI NGƯỜI CHƠI TỰ PHÂN BỔ
    apConversionRates: {
        hp: 200,   // 1 AP = +20 HP
        atk: 10,   // 1 AP = +1 ATK
        def: 10,   // 1 AP = +1 DEF
        spd: 10,   // 1 AP = +1 SPD
    },

    // 3. CÔNG THỨC EXP CẦN ĐỂ LÊN CẤP TIẾP THEO
    //    maxExp = base * (level ^ levelExponent) * (realmMultiplier ^ realmIndex)
    //    realmIndex = floor((level - 1) / 10)
    expFormula: {
        base: 100,
        levelExponent: 1.5,
        realmMultiplier: 1.8,
    },

    // 4. CÔNG THỨC SỐ ĐIỂM AP NHẬN ĐƯỢC MỖI KHI LÊN CẤP
    //    AP mỗi cấp = base + (perRealmBonus * realmIndex)
    //    Mỗi lần đột phá cảnh giới (mỗi 10 cấp) được cộng thêm 1 lần: breakthroughBonusUnit * lần_đột_phá_thứ_mấy
    apPerLevel: {
        base: 5,
        perRealmBonus: 3,
        breakthroughBonusUnit: 10,
    },

    // 5. CÔNG THỨC SÁT THƯƠNG
    damageFormula: {
        critRateCapPercent: 100,      // Trần tỉ lệ chí mạng — vượt quá sẽ đổi thành CDMG
        critOverflowToCdmgDivisor: 2, // Cứ dư 2% CR vượt trần = +1 CDMG
        defenseBaseK: 30,             // K_DEFENSE = defenseBaseK + defensePerLevelK * (level - 1)
        defensePerLevelK: 4,          // DEF càng cao thì giảm sát thương càng nhiều, nhưng K tăng theo level mục tiêu để DEF không bị lạm phát
    },

    // 6. HỆ SỐ GIÁ MUA/BÁN THEO ĐỘ KHÓ
    difficultyMultipliers: {
        'Dễ':           { sell: 0.9, buy: 1.0 },
        'Thường':       { sell: 0.7, buy: 1.3 },
        'Khó':          { sell: 0.5, buy: 1.8 },
        'Ác Mộng':      { sell: 0.3, buy: 2.5 },
        'Tuỳ Chỉnh AI': { sell: 0.3, buy: 1.3 },
    },

    // 7. ĐỘ NGẪU NHIÊN CỦA "NGÂN SÁCH" VẬT PHẨM THEO ĐỘ KHÓ, dạng [min, max]
    difficultyRandomness: {
        'Dễ':           [99999, 99999],
        'Thường':       [99999, 99999],
        'Khó':          [99999, 99999],
        'Ác Mộng':      [99999, 99999],
        'Tuỳ Chỉnh AI': [99999, 99999],
    },

    // 8. GIÁ TRỊ GỐC (Value) THEO ĐỘ HIẾM — dùng cho cả ngân sách vật phẩm lẫn
    //    ngưỡng quy đổi độ hiếm khi dung hợp (Lò Vạn Vật)
    rarityBaseValue: {
        'Thường': 100,
        'Tốt': 300,
        'Hiếm': 1000,
        'Cực Phẩm': 2000,
        'Siêu Phẩm': 4000,
        'Huyền Thoại': 10000,
        'Thần Thoại': 100000, // Phẩm đặc biệt cực kỳ mạnh — ngân sách gấp 10 lần Huyền Thoại
    },

    // 9. HỆ SỐ NHÂN GIÁ TRỊ THEO LOẠI VẬT PHẨM (category)
    itemTypeMultiplier: {
        'Vũ khí': 1.0, 'Thân': 1.0, 'Đầu': 1.0, 'Chân': 1.0, 'Phụ kiện': 1.1,
        'Trữ vật': 1.0, 'Dị thường': 1.5, 'Phương tiện': 1.2,
        'Đan dược': 0.15, 'Thực phẩm': 0.15, 'Đa năng': 0.2,
        'Nguyên liệu': 0.1, 'Tạp vật': 0.05, 'Tín vật': 0.3,
        'Sách kỹ năng': 2.0,
    },

    // 10. DUNG HỢP / CHẾ TẠO (tính năng "Lò Vạn Vật")
    fusion: {
        costRate: 0.1,             // Chi phí dung hợp = 10% tổng giá trị nguyên liệu
        valueDivisor: 0.5,         // Giá trị vật phẩm ra lò = tổng giá trị nguyên liệu / 0.5
        breakthroughChance: 1,  // 8% cơ hội vật phẩm ra lò được +1 bậc hiếm
    },

    // 11. TỈ LỆ RƠI ĐỘ HIẾM VẬT PHẨM THEO KHOẢNG LEVEL (mỗi dòng nên cộng lại = 100)
    // "Thần Thoại" là phẩm chất cao nhất, cao hơn "Huyền Thoại" — cực kỳ hiếm, chỉ bắt đầu
    // có cơ hội rơi ra từ level 21 trở đi, tăng dần theo level. Mỗi dòng cộng lại vẫn = 100.
    rarityDistributionByLevel: {
        '1-10':   { 'Thường': 40, 'Tốt': 30, 'Hiếm': 20, 'Cực Phẩm': 6,  'Siêu Phẩm': 3,  'Huyền Thoại': 1, 'Thần Thoại': 0 },
        '11-20':  { 'Thường': 30, 'Tốt': 30, 'Hiếm': 23, 'Cực Phẩm': 10, 'Siêu Phẩm': 5,  'Huyền Thoại': 2, 'Thần Thoại': 0 },
        '21-30':  { 'Thường': 20, 'Tốt': 30, 'Hiếm': 28, 'Cực Phẩm': 14, 'Siêu Phẩm': 6,  'Huyền Thoại': 1, 'Thần Thoại': 1 },
        '31-40':  { 'Thường': 10, 'Tốt': 25, 'Hiếm': 32, 'Cực Phẩm': 22, 'Siêu Phẩm': 8,  'Huyền Thoại': 2, 'Thần Thoại': 1 },
        '41-50':  { 'Thường': 5,  'Tốt': 20, 'Hiếm': 35, 'Cực Phẩm': 25, 'Siêu Phẩm': 11, 'Huyền Thoại': 3, 'Thần Thoại': 1 },
        '51+':    { 'Thường': 1,  'Tốt': 15, 'Hiếm': 35, 'Cực Phẩm': 25, 'Siêu Phẩm': 17, 'Huyền Thoại': 5, 'Thần Thoại': 2 },
    },

    // 12. GIỚI HẠN SỐ LƯỢT HỒI CHIÊU TỐI ĐA CHO 1 KỸ NĂNG COMBAT
    skillCooldownMax: 0,

    // 13. KHOẢNG CÁCH TỐI THIỂU (mili-giây) GIỮA 2 LẦN GỌI GEMINI API LIÊN TIẾP.
    //     Bắt buộc phải >= (60000 / RPM giới hạn thật của tài khoản bạn), xem tại
    //     aistudio.google.com > Rate Limit. Free tier "Gemini 3 Flash" hiện chỉ cho 5 RPM
    //     => tối thiểu 12000ms/request. Để 13000 cho có biên an toàn.
    //     Nếu sau này nâng cấp tài khoản trả phí (RPM cao hơn), giảm số này để game chạy nhanh hơn.
    apiQueueDelayMs: 13000,

    // 14. EXP KỸ NĂNG — Ngưỡng EXP cần để 1 kỹ năng tự động tăng 1 bậc phẩm chất.
    //     Giá trị = rarityBaseValue[bậc] * 2. Chỉnh riêng từng bậc thoải mái mà không ảnh hưởng bậc khác.
    //     "Thần Thoại" là bậc tối đa — không dùng ngưỡng này, kỹ năng khoá EXP khi đạt bậc này.
    skillExpToNextRarity: {
        'Thường': 200,
        'Tốt': 600,
        'Hiếm': 2000,
        'Cực Phẩm': 4000,
        'Siêu Phẩm': 8000,
        'Huyền Thoại': 20000,
        'Thần Thoại': null,
    },

    // 15. LƯỢNG EXP KỸ NĂNG NHẬN ĐƯỢC MỖI LẦN "DÙNG"
    skillExpPerUse: 10,              // Kỹ năng chiến đấu: mỗi lần tung chiêu trong trận.
    skillExpPerAdventureTrigger: 10, // Kỹ năng phiêu lưu: mỗi lần sự kiện liên quan xảy ra (bán/mua/chế tạo/rớt đồ/qua lượt...).

    // ------------------------------------------------------------------------
    // 16. TIẾN TRÌNH EXP & CẢNH GIỚI (GDD 02 phần A — "EXP & Realm Progression")
    //     Mọi tỷ lệ dưới đây được nhân với exp_threshold(level) — tức là chính
    //     công thức expFormula ở mục 3 (quyết định C-4: GIỮ đường cong của game,
    //     chỉ lấy 4 nguồn EXP tất định + cổng "Chờ Đột Phá" của GDD).
    //     Logic nằm ở src-web/systems/exp/, không nằm trong App.tsx.
    // ------------------------------------------------------------------------
    expProgression: {
        // Hai hằng số ngưỡng của GDD. Theo C-4 chúng chỉ còn ý nghĩa HIỂN THỊ +
        // kiểm tra hợp lệ lúc nạp cấu hình (BASE > 0, INCREMENT >= 0); đường cong
        // thật vẫn là expFormula ở mục 3.
        BASE_EXP_THRESHOLD: 100,
        EXP_THRESHOLD_INCREMENT: 10,

        // Nguồn 1 — THẮNG TRẬN: WIN_EXP_BASE_FRACTION * ngưỡng * hệ số chênh cảnh giới.
        // Hệ số = clamp(1 + WIN_EXP_TIER_BONUS * (cảnh giới địch - cảnh giới ta), FLOOR, CEIL).
        WIN_EXP_BASE_FRACTION: 0.20,
        WIN_EXP_TIER_BONUS: 0.25,
        WIN_EXP_FLOOR_MULT: 0.30,   // sàn: đánh kẻ yếu hơn nhiều vẫn được 30%
        WIN_EXP_CEIL_MULT: 3.0,     // trần: đánh vượt cảnh giới tối đa x3

        // Nguồn 2 — THUA TRẬN (không phụ thuộc cảnh giới đối thủ).
        // BẤT BIẾN BẮT BUỘC: WIN_EXP_BASE_FRACTION * WIN_EXP_FLOOR_MULT >= LOSS_EXP_RATE,
        // nếu không, cố tình thua sẽ có lợi hơn thắng (0.20 * 0.30 = 0.06 >= 0.04 ✔).
        LOSS_EXP_RATE: 0.04,

        // Nguồn 3 — TU LUYỆN THỤ ĐỘNG: mỗi lượt NGOÀI chiến đấu.
        PASSIVE_EXP_RATE: 0.001,

        // Nguồn 4 — SONG TU: chỉ khi tâm pháp loại "song tu" VÀ đang có đạo lữ,
        // VÀ đang ngoài chiến đấu. KHÔNG cộng dồn theo số lượng đạo lữ.
        SONG_TU_EXP_RATE: 0.0015,

        // Trần EXP mỗi lượt, tính theo bội số của ngưỡng cấp hiện tại. GDD tự thừa
        // nhận không có cơ chế nào chặn nhảy nhiều cấp trong 1 lượt nếu hệ số tâm
        // pháp quá lớn (A9 #2) — đây là van an toàn cho lỗ hổng đó. Đặt 0 để tắt.
        TURN_EXP_CAP_FRACTION: 20,

        // Trần EXP cho nguồn "sự kiện tự do" do AI chấm ([ENCOUNTER_REWARD]).
        // Quyết định C-1: tag này bị HẠ CẤP, không còn là nguồn EXP duy nhất/vô hạn.
        FREE_EVENT_EXP_CAP_FRACTION: 0.10,

        // Trần khuyến nghị cho hệ số nhân EXP của tâm pháp (hệ tâm pháp chưa làm).
        TAM_PHAP_EXP_MULTIPLIER_MAX: 3.0,

        // Trần cho các chỉ số dạng phần trăm ở mục 17 (quy về hệ số 0..1).
        PERCENT_STAT_CAP: 0.95,
    },

    // ------------------------------------------------------------------------
    // 17. TĂNG TRƯỞNG CHỈ SỐ THEO CẤP/CẢNH GIỚI (GDD 02 D.5)
    //     chỉ_số = gốc + LEVEL_GROWTH_X * (cấp - 1) + BREAKTHROUGH_BONUS_X * (cảnh giới - 1)
    //              + điểm AP người chơi tự phân bổ (quyết định C-5: GIỮ hệ AP).
    //     4 chỉ số thô (HP/ATK/DEF/SPD) không bị chặn trần; 8 chỉ số phần trăm bị
    //     chặn bởi PERCENT_STAT_CAP ở mục 16 và tính theo hệ số 0..1 (0.008 = 0.8%).
    //     GDD mới tune 3/12 chỉ số (HP, ATK, Tỉ lệ chí mạng); 9 chỉ số còn lại là
    //     giá trị tạm, chờ một đợt cân bằng riêng.
    // ------------------------------------------------------------------------
    statGrowth: {
        LEVEL_GROWTH_HP: 8,
        LEVEL_GROWTH_ATK: 1.5,
        LEVEL_GROWTH_DEF: 1.2,
        LEVEL_GROWTH_SPD: 0.5,
        LEVEL_GROWTH_CRIT_RATE: 0.008,
        LEVEL_GROWTH_CRIT_DAMAGE: 0.004,
        LEVEL_GROWTH_ACC: 0.004,
        LEVEL_GROWTH_EVASION: 0.003,
        LEVEL_GROWTH_LIFESTEAL: 0.002,
        LEVEL_GROWTH_HP_REGEN: 0.002,
        LEVEL_GROWTH_AMP: 0.003,
        LEVEL_GROWTH_MITIGATION: 0.003,

        BREAKTHROUGH_BONUS_HP: 50,
        BREAKTHROUGH_BONUS_ATK: 8,
        BREAKTHROUGH_BONUS_DEF: 6,
        BREAKTHROUGH_BONUS_SPD: 3,
        BREAKTHROUGH_BONUS_CRIT_RATE: 0.02,
        BREAKTHROUGH_BONUS_CRIT_DAMAGE: 0.02,
        BREAKTHROUGH_BONUS_ACC: 0.01,
        BREAKTHROUGH_BONUS_EVASION: 0.01,
        BREAKTHROUGH_BONUS_LIFESTEAL: 0.01,
        BREAKTHROUGH_BONUS_HP_REGEN: 0.01,
        BREAKTHROUGH_BONUS_AMP: 0.01,
        BREAKTHROUGH_BONUS_MITIGATION: 0.01,
    },

    // ------------------------------------------------------------------------
    // 18. DỮ LIỆU TRANG BỊ & KỸ NĂNG (GDD 02 phần B)
    //     Chỉ là ngưỡng CẢNH BÁO lúc tạo nội dung, không chặn game chạy.
    // ------------------------------------------------------------------------
    equipment: {
        min_thuc_per_skill: 3,              // dưới mức này: cảnh báo khi tạo kỹ năng mới
        max_known_skills_per_character: 6,  // vượt mức này: cảnh báo, không chặn
    },
    // ------------------------------------------------------------------------
    // 19. HẢO CẢM NPC (GDD 03 phần 1) — 21 hằng số
    //     Mọi thay đổi hảo cảm đều do module tất định tính (quyết định C-1):
    //     AI chỉ được nói "quan hệ đã đổi", ĐỘ LỚN luôn tra từ bảng D.1 dưới đây.
    //     Dấu đã nằm sẵn trong giá trị (INSULT_DELTA = -8), KHÔNG đảo dấu lần nữa.
    //     Delta ÂM không bao giờ bị giảm dần/mệt mỏi/chặn trần — mất lòng luôn
    //     rẻ hơn lấy lòng, đó là bất đối xứng cố ý của GDD.
    // ------------------------------------------------------------------------
    affinity: {
        // D.1 — bảng sự kiện -> delta gốc
        GIFT_DELTA: 5,                    // tặng quà (an toàn 2..10)
        SMALL_HELP_DELTA: 3,              // giúp việc nhỏ (1..6)
        SAVE_LIFE_DELTA: 15,              // cứu mạng (8..25)
        LOSS_VS_NPC_DELTA: -3,            // thua NPC trong trận (-6..0)
        COMBAT_WIN_BASE: 5,               // thắng NPC: phần nền của -(BASE + SCALE*margin)
        COMBAT_WIN_MARGIN_SCALE: 10,      // thắng càng áp đảo càng bị ghét (0..15)
        SEVERE_WIN_MARGIN_THRESHOLD: 0.7, // >= mức này: mức độ nghiêm trọng 2 -> 3 (lan truyền được)
        INSULT_DELTA: -8,                 // xúc phạm (-15..-3)
        THREATEN_DELTA: -12,              // đe dọa (-20..-6)
        BETRAY_DELTA: -30,                // phản bội (-45..-15)
        KILL_WITNESS_DELTA: -25,          // giết người, tính CHO MỖI nhân chứng (-40..-15)

        // D.2 — giảm dần khi hảo cảm đã cao (chỉ áp cho delta DƯƠNG)
        DIMINISH_EXPONENT: 3,             // độ cong (2..5)
        DIMINISH_FLOOR: 0.1,              // sàn, TUYỆT ĐỐI không được là 0 (0.05..0.3)

        // D.3 — mệt mỏi khi lặp lại, cửa sổ trượt theo lượt
        FATIGUE_RATE: 0.15,               // mỗi lần lặp giảm 15% (0.05..0.3)
        FATIGUE_FLOOR: 0.25,              // sàn hệ số mệt mỏi (0.1..0.5)
        FATIGUE_WINDOW_TURNS: 5,          // 3..8, BẮT BUỘC >= POSITIVE_SOCIAL_COOLDOWN_TURNS

        // D.4 — trần tổng delta DƯƠNG mỗi NPC mỗi lượt (không áp cho delta âm)
        CAP_POSITIVE_PER_TURN: 20,        // 15..25

        // D.5 — lan truyền 1 bước qua đồ thị link_strength
        PROPAGATION_RATE: 0.5,            // luôn < 1 (0.3..0.7)
        CRUELTY_REP_DELTA: -2,            // tiếng ác cộng thêm cho mỗi người liên đới (-5..-1)
        PROPAGATION_SEVERITY_MIN: 3,      // chỉ lan khi mức nghiêm trọng >= 3 (2..4)

        // Song Tu NẰM NGOÀI phạm vi (quyết định C-6): hằng số này chỉ để đồng bộ
        // cấu hình, không module nào đọc. Ngưỡng 80 của handleSongTu giữ nguyên.
        SONG_TU_COOLDOWN_TURNS: 5,
    },

    // ------------------------------------------------------------------------
    // 20. CÁI CHẾT & HẬU QUẢ (GDD 03 phần 2) — 12 hằng số
    //     Quyết định C-7: GIỮ hồi sinh (handleRespawn) — module chỉ quyết định
    //     NGƯỜI CHƠI CÓ CHẾT HAY KHÔNG thay cho AI, không khóa slot, không làm
    //     chết vĩnh viễn. Quyết định C-11: "thương tật nặng" = trạng thái dài hạn
    //     "Phế Đan Điền" (chặn EXP + giảm chỉ số), KHÔNG đụng vào CombatLoop.
    //     3 cặp MIN < MAX bên dưới là bất biến bắt buộc, được kiểm lúc nạp cấu hình.
    // ------------------------------------------------------------------------
    death: {
        // D.1 — xác suất tử vong: P = clamp(BASE + SCALE * margin, MIN, MAX)
        DEATH_ROLL_BASE: 0.10,            // 0..0.3
        DEATH_ROLL_SCALE: 0.85,           // 0..1
        DEATH_ROLL_MIN: 0.05,             // không bao giờ 0% (0..0.2)
        DEATH_ROLL_MAX: 0.95,             // không bao giờ 100% (0.8..1.0)

        // D.2 — bậc hậu quả theo margin của kẻ thắng
        SEVERITY_MILD_THRESHOLD: 0.35,    // < mức này: nhẹ "trọng thương" (0.2..0.5)
        SEVERITY_SEVERE_THRESHOLD: 0.75,  // >= mức này: nặng "phế đan điền" (0.6..0.85)

        // D.3 — hồi phục khỏi trạng thái phế đan điền
        RECOVERY_FORTUNE_RATE: 0.70,      // đại cơ duyên (0.5..0.9)
        RECOVERY_ITEM_MIN: 0.05,          // sàn hiệu lực tiên thảo dị bảo (0..0.2)
        RECOVERY_ITEM_MAX: 0.90,          // trần hiệu lực (0.7..0.95)
        RECOVERY_SELF_RATE: 0.12,         // tự tu, đường rẻ nhất mà đắt nhất về thời gian (0.03..0.15)
        RECOVERY_SELF_COOLDOWN_TURNS: 5,  // số lượt chờ giữa 2 lần tự tu (5..15)

        // Sai lệch có chủ ý (C-11): GDD dùng hệ số này nhân vào sức chiến đấu.
        // Combat nằm ngoài phạm vi nên hiệu ứng được thể hiện qua trạng thái
        // "Phế Đan Điền"; hằng số giữ lại để đồng bộ cấu hình và cho test.
        CRIPPLED_PENALTY_MULT: 0.85,
    },

    // ------------------------------------------------------------------------
    // 21. THẾ GIỚI KHÁCH QUAN (Pillar 1 — design/gdd/game-concept.md)
    //     Thế giới KHÔNG xoay quanh nhân vật chính. Hai cơ chế có con số:
    //     (a) TRỌNG THƯƠNG DO CHÊNH CẤP: kẻ ĐỊCH cao hơn người chơi quá 20 cấp
    //         (hằng số khóa HOSTILE_INITIATIVE_LEVEL_GAP_MAX, không nằm ở đây)
    //         BẮT BUỘC mang cựu thương: cảnh giới HIỆU LỰC bị kéo về
    //         (cấp người chơi + 20), cảnh giới THẬT được lưu lại, và thương thế
    //         CÓ THỂ HỒI PHỤC HOÀN TOÀN (linh đan / kỳ ngộ / danh y). Thời gian
    //         trôi qua KHÔNG tự chữa lành. NPC trung lập/thân thiện được miễn.
    //     (b) TRẦN THÀNH CÔNG KHI VƯỢT TẦM: khi NPC liên quan mạnh hơn người
    //         chơi từ 1 cảnh giới (10 cấp) trở lên, tổng trọng số các kịch bản
    //         "success" do API 1 chấm bị chặn trần; phần dư được chia lại cho
    //         "failure"/"partial". Đây là sàn cơ học đỡ cho phần chỉ thị prompt.
    //     Logic nằm ở src-web/systems/objectivity/, không nằm trong App.tsx.
    // ------------------------------------------------------------------------
    objectivity: {
        // (a) Miễn trọng thương nếu chính người chơi khiêu khích trước?
        // Quy tắc của chủ dự án là VÔ ĐIỀU KIỆN => để false. Bật true chỉ khi
        // muốn "chọc tổ ong vò vẽ thì ráng chịu" trở thành luật chơi.
        GAP_INJURY_EXEMPT_WHEN_PROVOKED: false,

        // (b) Một "cảnh giới" = bao nhiêu cấp (toàn game dùng 10).
        OVERREACH_TIER_SIZE: 10,

        // (b) Trần TỔNG trọng số kịch bản "success" theo số cảnh giới chênh.
        // BẮT BUỘC không tăng dần: TIER1 >= TIER2 >= TIER3, và đều nằm trong (0, 1].
        OVERREACH_SUCCESS_CAP_TIER1: 0.35,  // chênh 1 cảnh giới (10-19 cấp)
        OVERREACH_SUCCESS_CAP_TIER2: 0.10,  // chênh 2 cảnh giới (20-29 cấp)
        OVERREACH_SUCCESS_CAP_TIER3: 0.03,  // chênh >= 3 cảnh giới (30+ cấp)

        // (b) Trần cho "partial" = trần "success" nhân hệ số này (>= 1).
        OVERREACH_PARTIAL_CAP_MULT: 2,
    },

    // ------------------------------------------------------------------------
    // 22. KIỂM ĐỊNH LỜI KỂ (narration lint — bộ đo cho Pillar 1 + chống lặp thoại)
    //     Đây là bộ ĐO đầu ra của API 2, không phải luật cho AI: sau mỗi lượt kể,
    //     src-web/systems/contract/narrationLint.ts quét văn bản và báo vi phạm
    //     ra console + bộ golden (tests/golden/narration/README.md).
    //     Danh sách cụm từ lấy từ chính các ví dụ SAI trong chỉ thị Pillar 1
    //     (narrationDirectives.ts) — sửa ở đây thì lint đổi, prompt không đổi.
    // ------------------------------------------------------------------------
    narrationLint: {
        // Cụm NGƯỜI KỂ (ngoài thẻ <dialogue>) khẳng định nhân vật chính vượt trội.
        OBJECTIVE_PRAISE_PHRASES: [
            'thiên phú nghìn năm có một',
            'thiên phú vô song',
            'kẻ mạnh nhất nơi này',
            'ai cũng phải thừa nhận',
            'khiến cả đám cao thủ chấn động',
            'khí thế kinh người',
            'trong mắt hiện lên vẻ tán thưởng',
            'quyết định sẽ dõi theo',
            'kỳ tài trăm năm',
            'vạn năm có một',
            'nghìn năm có một',
            'trăm năm hiếm có',
            'không ai sánh bằng',
            'tuyệt thế kỳ tài',
        ],
        // Cụm khen CHUNG CHUNG trong lời thoại NPC (không chỉ vào việc cụ thể).
        GENERIC_PRAISE_PHRASES: [
            'thiên tài',
            'vô song',
            'phi phàm',
            'kỳ tài',
            'tuyệt thế',
            'vạn năm có một',
            'nghìn năm có một',
            'trăm năm hiếm có',
            'tương lai vô hạn',
            'tiền đồ vô lượng',
            'đỉnh thiên hạ',
            'không ai sánh bằng',
            'thiên tư hơn người',
        ],
        // NPC cao hơn người chơi từ ngần này cấp = "bề trên": khen chung chung
        // bị tính nặng hơn (superior_overpraise). Trùng OVERREACH_TIER_SIZE.
        SUPERIOR_NPC_LEVEL_GAP: 10,
        // Độ giống (Jaccard trên cặp từ) từ mức này trở lên = lặp thoại (0..1].
        REPEAT_SIMILARITY_THRESHOLD: 0.6,
        // So câu mới với bao nhiêu câu gần nhất của CÙNG NPC (1..20).
        REPEAT_WINDOW_PER_SPEAKER: 6,
        // Câu ngắn hơn ngần này từ không tính lặp ("Ừm.", "Đi thôi.").
        REPEAT_MIN_TOKENS: 4,
        // Xưng hô lai dịch sát chữ truyện mạng Trung Quốc ("muội nhi" = 妹儿),
        // không phải tiếng Việt. Quét cả tường thuật lẫn MỌI lời thoại (kể cả
        // lời nhân vật chính do AI viết). So khớp nguyên từ: "muội nhi" không
        // bắt "muội nhìn". Để [] = tắt kiểm tra. Báo cáo 2026-09-25.
        CONVERT_REGISTER_PHRASES: [
            'muội nhi',
            'tỷ nhi',
            'tỉ nhi',
            'đệ nhi',
            'huynh nhi',
            'ca nhi',
            'nàng nhi',
            'ngươi nhi',
            'sư muội nhi',
            'sư đệ nhi',
            'công chúa nhi',
            'huynh đài nhi',
        ],

        // ---- Phần B: CHỐT CHỮA (src-web/systems/contract/narrationGuard.ts) ----
        // Loại vi phạm nào thì gọi lại API 2 đúng một lần kèm chỉ dẫn đích danh.
        // Bỏ bớt phần tử để thu hẹp (vd. chỉ ['repeated_line'] = chỉ chống lặp).
        GUARD_RETRY_KINDS: ['repeated_line', 'ungrounded_praise', 'superior_overpraise', 'objective_praise', 'missing_thuc', 'convert_register'],
        // Số lần gọi lại tối đa mỗi lượt (0 = chỉ phòng, không chữa; 1 = thiết kế).
        // Lệch có chủ ý so với gdd-01 C.4 F2 "một lệnh gọi tường thuật/lượt":
        // calls_per_turn là tập boolean nên không đổi, nhưng lượt có thể lâu hơn.
        GUARD_RETRY_MAX: 1,
        // Khối "NPC đã nói gần đây" chèn cuối prompt: số câu mỗi NPC và trần ký tự.
        RECENT_LINES_PROMPT_PER_SPEAKER: 4,
        RECENT_LINES_PROMPT_MAX_CHARS: 1500,
    },

    // ------------------------------------------------------------------------
    // 23. CHIẾN ĐẤU TƯỜNG THUẬT (STORY mode — Pillar 3 "Sức Mạnh Có Logic")
    //     Bảng Tuning Knobs của design/gdd/combat-system.md, port cho đường
    //     kể chuyện (src-web/systems/combat/narrativeExchange.ts). Sa bàn
    //     (CombatLoop) KHÔNG dùng block này. Hệ thống tính xong pha giao đấu
    //     rồi khóa kết quả; AI chỉ kể lại (game-concept.md Khế Ước).
    //     Hai ràng buộc chéo được kiểm khi nạp: ONSET < CAP và CAP − ONSET ≥ 120.
    // ------------------------------------------------------------------------
    narrativeCombat: {
        // D.1 — áp chế cảnh giới & phạt trang bị: % giảm chỉ số mỗi bậc chênh (0.05..0.30)
        PENALTY_PER_TIER: 0.15,
        FLOOR_LAYER: 0.1,            // sàn mỗi lớp phạt (0.05..0.3)
        FLOOR_TOTAL: 0.05,           // sàn TỔNG sau khi nhân các lớp (0.02..0.15)
        CRIPPLED_PENALTY_MULT: 0.85, // đang "Phế Đan Điền" (0.7..0.95)
        // LỆCH CÓ CHỦ Ý: app không có chỉ số chính xác (ACC) → dùng hằng này thay
        // base_ACC cho MỌI nhân vật; "Né" = evasion (%) của app trên cùng thang.
        BASE_ACC: 50,
        // D.3 — trúng/hụt: P = clamp(0.5 + K_HIT·(ACC − Né), P_MIN, P_MAX)
        K_HIT: 0.01,
        P_MIN: 0.05,
        P_MAX: 0.95,
        // D.4 / D.6 — sát thương: sàn chip theo % ATK; sàn hệ số cuối; giảm khi Phòng thủ
        MIN_RAW_RATIO: 0.05,
        MIN_DMG_MULT: 0.1,
        DEFEND_DMG_REDUCTION_PCT: 0.35,
        // D.11 — bỏ chạy: P = clamp(0.5 + K_FLEE·(SPD mình − SPD địch))
        K_FLEE: 0.01,
        P_MIN_FLEE: 0.05,
        P_MAX_FLEE: 0.95,
        // Core Rule #2 Tầng 1 — NPC tự bỏ chạy dưới % HP này (trận sinh tử)
        NPC_FLEE_HP_THRESHOLD: 0.2,
        // D.10 / D.4b — hồi máu (app chưa có chỉ số → hiện = 0) và kiệt sức lũy tiến
        HP_REGEN_CAP: 0.05,
        EXHAUSTION_ONSET_EXCHANGE: 40,   // pha bắt đầu kiệt sức (20..80)
        EXHAUSTION_DRAIN_PCT: 0.05,      // KHÔNG dưới 0.05 (GDD: mất đảm bảo hội tụ)
        TECHNICAL_EXCHANGE_CAP: 200,     // van an toàn kỹ thuật (100..500)
        // D.9b — hòa giao hữu khi ngang sức và bên thắng danh nghĩa cũng kiệt lực
        SPAR_PARITY_TOLERANCE: 0.15,
        SPAR_LOW_HP_THRESHOLD: 0.15,
        // D.13 — trọng số HP trong Điểm Chỉ số (chỉ dùng cho parity gate)
        W_HP: 0.25,
    },
};
