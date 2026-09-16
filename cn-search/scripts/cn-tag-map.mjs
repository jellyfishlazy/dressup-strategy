/**
 * Shared mainland-CN → Taiwan wardrobe tag/category mapping for:
 * - scripts/build-cn-search-index.mjs (tagsTw fallback for CN-only rows)
 * - scripts/sync-wardrobe-tags-from-cn.mjs (reference tags)
 *
 * Keys in CN_TAG_OVERRIDE are simplified Chinese tokens as they appear in
 * reference `code2tag` / decoded wardrobe tags field.
 */

export const CN2TW_CATEGORY = Object.assign(Object.create(null), {
  发型: '髮型',
  连衣裙: '連身裙',
  外套: '外套',
  上装: '上衣',
  下装: '下著',
  '袜子-袜套': '襪子-腿飾',
  '袜子-袜子': '襪子-襪子',
  鞋子: '鞋子',
  '饰品-头饰·发饰': '飾品-頭飾·髮飾',
  '饰品-头饰·头纱': '飾品-頭飾·頭紗',
  '饰品-头饰·发卡': '飾品-頭飾·髮夾',
  '饰品-头饰·耳朵': '飾品-頭飾·耳朵',
  '饰品-耳饰': '飾品-耳飾',
  '饰品-颈饰·围巾': '飾品-頸飾·圍巾',
  '饰品-颈饰·项链': '飾品-頸飾·項鍊',
  '饰品-手饰·右': '飾品-手飾·右',
  '饰品-手饰·左': '飾品-手飾·左',
  '饰品-手饰·双': '飾品-手飾·手套',
  '饰品-手持·右': '飾品-手持·右',
  '饰品-手持·左': '飾品-手持·左',
  '饰品-手持·双': '飾品-手持·雙',
  '饰品-腰饰': '飾品-腰飾',
  '饰品-特殊·面饰': '飾品-特殊·面飾',
  '饰品-特殊·胸饰': '飾品-特殊·胸飾',
  '饰品-特殊·纹身': '飾品-特殊·紋身',
  '饰品-特殊·翅膀': '飾品-特殊·翅膀',
  '饰品-特殊·尾巴': '飾品-特殊·尾巴',
  '饰品-特殊·前景': '飾品-特殊·前景',
  '饰品-特殊·后景': '飾品-特殊·後景',
  '饰品-特殊·顶饰': '飾品-特殊·頂飾',
  '饰品-特殊·地面': '飾品-特殊·地板',
  '饰品-皮肤': '飾品-皮膚',
  妆容: '妝容',
  萤光之灵: '螢光之靈',
});

/** Simplified CN tag token → canonical TW tag (align with data/wardrobe.js wardrobeTags). */
export const CN_TAG_OVERRIDE = Object.assign(Object.create(null), {
  现代流行: 'POP',
  中性风: '中性風',
  大小姐: '大小姐',
  欧式古典: '歐式古典',
  中式古典: '中式古典',
  舞者: '舞者',
  波西米亚: '波西米亞',
  乐队风: '樂隊風',
  和风: '和風',
  医务使者: '從醫人員',
  轻熟风: 'OL',
  英伦: '英倫風',
  哥特风: '哥德風',
  洛丽塔: '蘿莉塔',
  童话系: '童話系',
  中式现代: '中式現代',
  民族风: '民族風',
  军装: '軍裝',
  未来系: '未來系',
  动物系: '小動物',
  动物风: '小動物',
  潮酷风: 'POP',
  森女系列: '森林系',
  女神系: '女神系',
  围裙: '圍裙',
  晚礼服: '晚禮服',
  碎花: '碎花',
  女仆装: '女僕裝',
  民国服饰: '民初服飾',
  旗袍: '旗袍',
  婚纱: '婚紗',
  防晒: '防曬',
  居家服: '居家服',
  工装风: '牛仔',
  睡衣: '睡衣',
  沐浴: '沐浴',
  冬装: '冬裝',
  兔女郎: '兔女郎',
  学院系: '學院風',
  泳装: '泳裝',
  航海风: '海軍風',
  运动系: '運動系',
  侠客联盟: '俠客聯盟',
  雨季装备: '雨季裝備',
  异域风: '印度服飾',
  POP: 'POP',
  pop: 'POP',
});

/**
 * After OpenCC or unknown paths, normalize legacy Traditional strings to canonical tags.
 */
export const TW_TAG_NORMALIZE = Object.assign(Object.create(null), {
  動物風: '小動物',
  動物系: '小動物',
  航海風: '海軍風',
  異域風: '印度服飾',
  潮酷風: 'POP',
  輕熟風: 'OL',
  工裝風: '牛仔',
});

export const SPLIT_SEG = /(\/|,|，)/;

export function splitPreserveSeg(s) {
  return String(s).split(SPLIT_SEG);
}
