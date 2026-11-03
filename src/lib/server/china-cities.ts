// English names for Chinese cities, for the city Hao detects from GPS (asked for in Chinese, so
// it matches the names here). Cities not listed keep their Chinese name.
const NAMES: Record<string, string> = {
  北京: 'Beijing', 上海: 'Shanghai', 天津: 'Tianjin', 重庆: 'Chongqing', 广州: 'Guangzhou', 深圳: 'Shenzhen', 成都: 'Chengdu',
  西安: "Xi'an", 杭州: 'Hangzhou', 南京: 'Nanjing', 武汉: 'Wuhan', 苏州: 'Suzhou', 长沙: 'Changsha', 郑州: 'Zhengzhou',
  青岛: 'Qingdao', 大连: 'Dalian', 沈阳: 'Shenyang', 哈尔滨: 'Harbin', 长春: 'Changchun', 济南: 'Jinan', 厦门: 'Xiamen',
  福州: 'Fuzhou', 昆明: 'Kunming', 贵阳: 'Guiyang', 南宁: 'Nanning', 桂林: 'Guilin', 海口: 'Haikou', 三亚: 'Sanya',
  合肥: 'Hefei', 南昌: 'Nanchang', 太原: 'Taiyuan', 石家庄: 'Shijiazhuang', 兰州: 'Lanzhou', 西宁: 'Xining', 银川: 'Yinchuan',
  乌鲁木齐: 'Ürümqi', 拉萨: 'Lhasa', 呼和浩特: 'Hohhot', 宁波: 'Ningbo', 无锡: 'Wuxi', 珠海: 'Zhuhai', 东莞: 'Dongguan',
  佛山: 'Foshan', 温州: 'Wenzhou', 洛阳: 'Luoyang', 大理: 'Dali', 丽江: 'Lijiang', 张家界: 'Zhangjiajie', 黄山: 'Huangshan',
  烟台: 'Yantai', 扬州: 'Yangzhou', 绍兴: 'Shaoxing', 秦皇岛: 'Qinhuangdao', 义乌: 'Yiwu', 金华: 'Jinhua', 徐州: 'Xuzhou',
  香港: 'Hong Kong', 澳门: 'Macao',
};

/** "杭州市" → "Hangzhou"; unknown cities keep their Chinese name without 市. */
export function cityInEnglish(zh: string) {
  const base = zh.replace(/(市|特别行政区|地区|自治州|盟)$/, '');
  return NAMES[base] ?? base;
}
