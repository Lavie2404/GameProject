# App.tsx Architecture Map (condensed, line refs as of 2026-08-17)

File: d:\GameProject\ai-story-game\App.tsx (34,502 lines) + gameConfig.js. React 18 + Vite; single-file monolith; `const App = () => {…}` at 16555–34502.

## Layout
- 1–8 imports (React, firebase, GAME_CONFIG). 9–110 SVG icons. 110–202 difficulty consts + calculateBalancingBudget:113.
- 571–2112 item/skill generation prompt builders (buildWeaponPrompt:653 … buildCreateSkillPrompt:1925).
- 2113–2248 core consts: INITIAL_STATS:2116, getItemRarityColor:2189, formatHistoryItemForPrompt:2218.
- 2249–2519 DialogueBubble:2249, StoryItem:2375. 2520–2665 translateGeminiApiError:2520, parseKeyValueString:2553 ([TAG: k="v"] parser), parseStatsBonus:2653.
- 2666–3334 combat math (calculateFinalDamage:2735 …), 3335–4113 class CombatLoop. 4114–4290 enums (PLAYER_PERSONALITIES:4114, TABS:4143, ITEM_TYPES:4150, LONG_TERM_STATUS_TEMPLATES:4155, STATUS_LIBRARY:4198).
- 4291–16244 components: InitialScreen:4749, ApiSetupModal:5385, GameSetupScreen:5468, CharacterInfoModal:6801, QuickLoreModal:7514, SettingsMenu:7959, CustomizationModal:8289, SaveSlotModal:8931, ChoiceButton:9037, ChoiceDetailModal:9074, GameplayScreen:9162, GameOverModal:10227, ConfirmationModal:10261, InventoryModal:13154.
- 13306–13502 IndexedDB (DB aiSimulatorDB, store npcAvatars; autosave_<gameId>, manual_local_<gameId>). 13646 class ApiQueueManager + globalApiQueue:13691.
- 15219–15734 stat fns: calculateMaxExpForLevel:15220, calculateTrueBaseStats:15226, calculateFinalStats:15256, canEquipItem:15440.
- 16054 INITIAL_GAME_SETTINGS; 16130 parseStoryWithDialogue.
- 16245–16554 remote: Supabase consts 16245; GitHub save 16250–16332 (githubApiFetch:16256, get/put/deleteGithubJsonFile, getGithubSaveIndex:16324); Supabase saves 16423–16554.
- 16555–34502 App component. Export 34503.

## State (inside App)
- gameSettings:18965 (INITIAL_GAME_SETTINGS: storyTitle, theme, setting, difficulty, currencyName, character* fields, initialMartialSouls, initialTraits, playStyle 'RPG'|'STORY', narratorPronoun, uiTheme, textScale, customThemeConfig, allowNsfw, customNsfwText, enableParasiticSystem (HTAB), fan-fic fields).
- storySummaries:18994, adventureTurnCount:18995, currentScreen:19003 ('initial'|'gameplay'|'setup'|'loading'), showGameOverModal:19005, apiKey:19009, apiMode:19010, currentTurn:19017.
- storyHistory:19553 [{id,type:'story'|'user'|'user_custom'|'system',content,transient?,summarized?}], currentStory, choices:19555, isLoading, savedGames:19563, allowUnexpectedEvent:19902.
- knowledge:19987 = { time{year,month,day,hour}, stateHistory, weather, narrativeCombatState, loreLocations, loreNpcs, loreItems, locations, items, worldItems, relationships, quests, trackedQuestId, realmProgressionList[], knownRecipes, eventHistory, characters[{...INITIAL_STATS}], sharedCooldowns, crisis flags, adventureSkillCooldowns, customRules, progression{recentMeaningfulActions[]}, htab{}, systemAssistant{}; lazily: loreQuests, pendingCreations, pendingModeChange, activeBreakthroughQuests, loreSkills }.
- Character (INITIAL_STATS:2116): id,isPlayer,isCompanion,inParty,isPermanentlyDead,loreId,Name,description,Role,Stance,Personality,Appearance,Backstory,Gender,titles[],affinity(-100..100),avatarBase64; level,exp,maxExp,realm,ap,currency,allocatedPoints{hp,atk,def,spd},current_location_id; baseHp/Atk/Def/Spd/Cr/Cdmg/DmgAmp/DmgRes/Evasion; derived hp,maxhp,atk,def,spd,cr,cdmg,…; learnedSkills[], equippedSkills{combat_basic_1..8,combat_ultimate,adventure_1..3}, inventory[], equippedItems{'Đầu','Thân','Chân','Vũ khí chính','Vũ khí phụ','Phụ kiện 1','Phụ kiện 2','Phương tiện','Trữ vật','Dị thường'}, longTermStatuses[], combatStatuses[].
- mainPlayer:20041, playerCharacter:20052, isProcessingAction:20112, gameMode 'EXPLORATION'|'COMBAT'|'TRADE'.

## Turn pipeline
- handleChoice:29186 / handleCustomAction:30023 → processPlayerAction:27995. Waits activeCriticalPromisesRef (28000). Incapacitation check 28010. COMBAT branch 28055–28179 (CombatLoop). currentTurn++ 28180. TRADE prompt 28198. EXPLORATION prompt 28283–28689 (logicRules, adventureSpecificRules 28530, summaries, history, contextBlock 28644, crisisInstructionBlock 28477, entityIndexBlock 28613, finalRequestBlock). → callGeminiAPI 28690.
- fetchWithRetries:17965; GEMINI_TEXT_MODEL_FALLBACKS:17944 (gemini-3-flash-preview, 3.5-flash, 3.1-flash-lite, 2.5-flash, 2.5-flash-lite); sticky model 17962; 503 breaker 90s (17949–17957); 429 quota,401 auth,403/404 skip model; queue delay GAME_CONFIG.apiQueueDelayMs=13000.
- callGeminiAPI:24867. Single-shot path 24888–24936. Hybrid path 24938–25309: API-1 "Expert Logic Engine" 24942–25012 (6 scenarios JSON schema logicSchema:25009 {probability,summary,classification_tags,relevant_entities,commands}), rollDiceAndChooseScenario:24699, entity hydration findLoreEntity:33400/formatEntityForPrompt:33447, API-2 "Narrative Engine" 25136–25235 (tagInstructions; nsfw branch 25087), tag strip 25241, combinedRawText = commands + narrative 25242.
- fetchGenericGeminiText:21992 (used by summarizer, Song Tu). runAPI3StateMonitor:29280 (background monitor: time/movement/status/HP/quest/EP corrections; critical promise). runQuestCheckAPI:32267.
- Parser parseGeminiResponseAndUpdateState:23201 (tagWithDataRegex 23232; choices scan 23544–23594; strips {Tỷ lệ…} 23576). Tags: USE_ITEM, WORLD_NPC, WORLD_LOCATION, WORLD_ITEM, REMOVE_WORLD_ITEM, LORE_LOCATION, LOCATION_STATE_UPDATE, CREATE_NPC, LORE_NPC, CHARACTER_UPDATE, CHARACTER_DEATH, CHARACTER_REVIVE, RELATIONSHIP_CHANGED, SYSTEM_*, ITEM_IDEA_GAINED, SKILL_IDEA_GAINED, REMOVE_SKILL_IDEA, OFFER_ITEM_IDEA, REALM_LIST, TIME_PASSED, AFFINITY_CHANGED(HTAB), LORE_QUEST, QUEST_*, START_COMBAT, ENTER_TRADE_MODE, SELL_VALUATION, BUY_NEGOTIATION, CONFIRM_SELL/BUY, USE_SKILL, END_COMBAT, SET_STARTING_LOCATION, SET_STARTING_TIME, MOVE_PLAYER, LORE_ITEM, SET_LEVEL, HTAB_UPDATE, ENCOUNTER_REWARD, APPLY_LONG_TERM_STATUS, RENAME_NPC, HEAL_PARTICIPANTS, ACTIVATE_ADVENTURE_SKILL, HTAB_AWAKEN; bare: EXIT_TRADE_MODE, CRISIS_*, SYSTEM_LEAVE, QUEST_CHECK. No STAT_CHANGE/EXP/LEVEL tag; exp/level via CHARACTER_UPDATE rejected 31779.
- processAndUpdateState:32280 → applyUpdates:30989–32266 (reducer): deaths +109, timePassed +867, relationships 31877–31896, encounterReward 31935, final reconciliation 32135–32180 (handleLevelUp → clamp → calculateFinalStats).

## Systems
(a) EXP: calculateMaxExpForLevel = floor(100·L^1.5·1.8^floor((L−1)/10)); calculateTotalAP:18568; handleLevelUp:22839; getRealmInfoFromLevel:22791 (realmIndex=floor((L−1)/10), tier=((L−1)%10)+1, overflow "Vô Định Cảnh"); calculateLevelFromRealmString:22821. XP only via [ENCOUNTER_REWARD ep_score,reason,target] 31935; MIN_EP_FOR_EXP_GAIN=10 (30986); anti-farm ×0.7/0.4/0.1 on repeated reason; expBasic=EP·2, expGrowth=(EP/3)·L, expBreakthrough=maxExp·0.5·(EP/100)² (31988). Skill XP addSkillExp:3315.
(b) Combat: CombatLoop:3335 intact (mechanics), UI removed; finalizeCombatEnd:27618 single Gemini narration; startCombat:18429; applyCombatResults:18647. KEEP AS-IS.
(c) Affinity: NPC.affinity int; [RELATIONSHIP_CHANGED NPC,Standing,Reason,AffinityChange] applied 31877–31890 (clamp ±100). handleRecruitCompanion:27110 (affinity≥50). SONG TU: SONG_TU_TITLE:27107 "Đạo Lữ", getDefaultNsfwText:27143, handleSongTu:27186–27320 (affinity≥80, +10, title, 5% skill, NSFW branch), getCharacterTitleTag:28429, QuickLoreModal button 7620. KEEP UNTOUCHED.
(d) Death: [CHARACTER_DEATH] 23324 → 31089–31106 soul stub {isPermanentlyDead}, player → GameOverModal:10227; handleRespawn:32347 (wipe inventory/equipment, hp=50%). [CHARACTER_REVIVE] 31204. "SỔ TỬ THẦN" block 28605.
(e) Save: IndexedDB autosave handleAutosave:32663 (turn 1 or %5); Firestore saveGameProgress:32442; Supabase VIP; GitHub 5 slots buildGithubSaveDataObject:20593, handleOpenGithubSaveModal:20624, handleConfirmGithubSaveSlot:20645 (saves/slot_N.json + index.json). Load loadGameAndResetHistory:17151, loadGame:21580, handleLoadGame:21055, handleSlotSelection:32389. No localStorage.
(f) Memory: checkForSummarization:30913 (>80 unsummarized → oldest 40 → runSummarizationInBackground:30829, "Biên Niên Sử" 350–500 words, sections [DIỄN BIẾN][NHÂN VẬT & QUAN HỆ][MANH MỐI & BÍ ẨN][ĐỊA ĐIỂM][TÀI SẢN & TU VI]); >20 summaries → fold 10 → "Đại Biên Niên Sử". filterHistoryContext:24822.
(g) Encounters: emergent from API-1 roll + allowUnexpectedEvent 28530; crisis arc turn≥150/200/250 (28477–28527, skipCrisis). Pending creations drained by fetchItemDetailsFromAI:22019, fetchSkillDetailsFromAI:22298, fetchQuestDetailsFromAI:22959.
(h) Setup: GameSetupScreen:5468, TABS WORLD/CHARACTER/ENTITIES/FAN_FICTION; handleInputChange:21716; initializeGame:26356 → handleStartGameplay:17472.
(i) Card: QuickLoreModal:7514, openQuickLoreModal:33249, formatStoryText:33473 (tap names), handleAppraiseNpc:16893, CharacterInfoModal:6801, QuickReferenceModal:12408.
(j) Items {Name,description,Type,Rarity,Value,Weight,Consumable,Equippable,quantity,stats_bonus,effects,usageCondition,id}; skills {Name,description,Rarity,skillType,skillCategory,cooldown,exp,effects,passive_effects,active_actions}; parseEffectsString:2982; handleEquipItem:26799; CraftingModal:11764/handleStartFusion:27340.
(k) Settings: SettingsMenu:7959 (BGM, playStyle, textScale 90–140, theme, save/load/export); ApiSetupModal:5385 (apiMode defaultGemini|userKey); CustomizationModal:8289 (hack: level handleCustomizeLevel:16991, base stats :17012, item :17029, skill :17055; exactValues flag 22231/22493).
(l) Nav: currentScreen initial/gameplay/setup; gameMode via knowledge.pendingModeChange + handlePendingModeChange:23606; goHome:32836, performRestart:32829. ~28 root modals 34102–34490.
(m) Time: 24h/30d/12mo applyTimeUpdate:25345; isTimeAfter:15249; formatTimeOfDay:25324; [TIME_PASSED]; locations {id,Name,description,category,tier,parentId,functions,openHours}; MOVE_PLAYER; isLocationOpen:30359.

## gameConfig.js keys
startingStats, apConversionRates, expFormula, apPerLevel, damageFormula, difficultyMultipliers, difficultyRandomness, rarityBaseValue, itemTypeMultiplier, fusion, rarityDistributionByLevel, skillCooldownMax, apiQueueDelayMs(13000), skillExpToNextRarity, skillExpPerUse, skillExpPerAdventureTrigger.

## External
Firebase anon auth + Firestore saves; GitHub Contents API (VITE_GITHUB_REPO default 'Lavie2404/GameProject', VITE_GITHUB_TOKEN); Supabase hardcoded; ImgBB; Gemini generateContent. No tests, no TODOs. No "Vô Danh Lục"/"Khế Ước" in code. Contract partially enforced by API-1/API-2 split (API-2 tags stripped 25241).

## Risks
God component; knowledge mutated via ≥4 channels; applyUpdates 1278 lines deep-clones; secrets client-side. Song Tu block 27107–27320 has 4-value dependency surface (npc.affinity, npc.titles, gameSettings.allowNsfw, customNsfwText).
