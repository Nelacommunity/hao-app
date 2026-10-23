// Photos for the Discover cards, bundled so they load offline and in mainland China (Wikimedia is blocked there).
// All are freely licensed files from Wikimedia Commons; each card shows its credit and links to the source page.
import type { ImageSourcePropType } from 'react-native';

export type Photo = { source: ImageSourcePropType; credit: string; url: string };

export const Photos: Record<string, Photo> = {
  'bargaining': { source: require('../../assets/discover/bargaining.webp'), credit: "Phil James · CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Beijing_silk_market.jpg" },
  'biangbiang': { source: require('../../assets/discover/biangbiang.webp'), credit: "Gary Soup · CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Biang_Biang_Mian.jpg" },
  'buddhas-delight': { source: require('../../assets/discover/buddhas-delight.webp'), credit: "FotoosVanRobin from Netherlands · CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Boeddha%27s_Delight.jpg" },
  'buddhist-cuisine': { source: require('../../assets/discover/buddhist-cuisine.webp'), credit: "Pratyeka at English Wikipedia · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Chinese-buddhist-cuisine-taiwan-1.jpg" },
  'calligraphy': { source: require('../../assets/discover/calligraphy.webp'), credit: "CEphoto, Uwe Aranas · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Dalian_Liaoning_China_Water-Calligraphy-01.jpg" },
  'chopsticks': { source: require('../../assets/discover/chopsticks.webp'), credit: "FiveRings at English Wikipedia · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Many-chopsticks.jpg" },
  'dragon-boat': { source: require('../../assets/discover/dragon-boat.webp'), credit: "Peter Olshevsky · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Dragon_Boat_race,_China.jpg" },
  'dumplings': { source: require('../../assets/discover/dumplings.webp'), credit: "Yeepunchmen · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:%E5%8F%B0%E7%81%A3%E5%8D%97%E6%8A%95%E8%8D%89%E5%B1%AF%E6%B0%B4%E9%A4%83Nantou,_Taiwan_Caotun_dumplings.jpg" },
  'face-changing': { source: require('../../assets/discover/face-changing.webp'), credit: "Yongxinge · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Bianlian.JPG" },
  'forbidden-city': { source: require('../../assets/discover/forbidden-city.webp'), credit: "Pixelflake · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:The_Forbidden_City_-_View_from_Coal_Hill.jpg" },
  'ganbei': { source: require('../../assets/discover/ganbei.webp'), credit: "Badagnani · CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:Jiugui.jpg" },
  'gongfu-tea': { source: require('../../assets/discover/gongfu-tea.webp'), credit: "Neptunati · Public domain", url: "https://commons.wikimedia.org/wiki/File:Gong_fu_cha.jpg" },
  'hanfu': { source: require('../../assets/discover/hanfu.webp'), credit: "Allervous · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Some_students_in_Hanfu_having_a_picnic.jpg" },
  'hongbao': { source: require('../../assets/discover/hongbao.webp'), credit: "Craig · Public domain", url: "https://commons.wikimedia.org/wiki/File:Ang_pow.jpg" },
  'hot-water': { source: require('../../assets/discover/hot-water.webp'), credit: "Denae Bedard · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Thermos.JPG" },
  'hotpot': { source: require('../../assets/discover/hotpot.webp'), credit: "Praneeth Thalla · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Hot_Pot.jpg" },
  'hutongs': { source: require('../../assets/discover/hutongs.webp'), credit: "Geoff McKim · CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Beijing_hutong_area_3.jpg" },
  'jianbing': { source: require('../../assets/discover/jianbing.webp'), credit: "Amazingloong · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:%E7%85%8E%E9%A5%BC%E9%A6%83%E5%AD%90%E5%88%B6%E4%BD%9C%E8%BF%87%E7%A8%8B5.jpg" },
  'kuanzhai-alley': { source: require('../../assets/discover/kuanzhai-alley.webp'), credit: "Daderot · CC0", url: "https://commons.wikimedia.org/wiki/File:Shops_-_Kuanzhai_Alleys_-_Chengdu,_China_-_DSC05305.jpg" },
  'kung-fu': { source: require('../../assets/discover/kung-fu.webp'), credit: "Shi Deru · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Shi_DeRu_and_Shi_DeYang.jpg" },
  'labour-day': { source: require('../../assets/discover/labour-day.webp'), credit: "czhongwu · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:%E5%8D%81%E4%B8%80%E9%BB%84%E9%87%91%E5%91%A8%E7%9A%84%E4%BA%9A%E9%BE%99%E6%B9%BE.jpg" },
  'lantern': { source: require('../../assets/discover/lantern.webp'), credit: "Zest · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Lantern_Festival_in_Taiwan_at_night_5.jpg" },
  'mahjong': { source: require('../../assets/discover/mahjong.webp'), credit: "yui* · CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Mahjong_game.jpg" },
  'mapo-tofu': { source: require('../../assets/discover/mapo-tofu.webp'), credit: "Sichuanfoodlover · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Authentic_Mapo_Tofu.jpg" },
  'mapo-tofu-2': { source: require('../../assets/discover/mapo-tofu-2.webp'), credit: "Archon6812 · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Billyfoodmabodofu3.jpg" },
  'mid-autumn': { source: require('../../assets/discover/mid-autumn.webp'), credit: "Fanny Schertzer · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Mooncake_3-4,_lotus_seed_paste.jpg" },
  'muslim-quarter': { source: require('../../assets/discover/muslim-quarter.webp'), credit: "David Stanley from Nanaimo, Canada · CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Muslim_Quarter_in_Xi%27an_(48785759581).jpg" },
  'nanluoguxiang': { source: require('../../assets/discover/nanluoguxiang.webp'), credit: "Anagoria · CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:2016-09-04_Beijing_Nanluoguxiang_anagoria_23.jpg" },
  'national-day': { source: require('../../assets/discover/national-day.webp'), credit: "pfctdayelise · CC BY-SA 2.5", url: "https://commons.wikimedia.org/wiki/File:National_Day_decorations_-_Beihai_Park.JPG" },
  'new-year': { source: require('../../assets/discover/new-year.webp'), credit: "Suicup · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Chinesenewyearfireworkman.jpg" },
  'night-markets': { source: require('../../assets/discover/night-markets.webp'), credit: "Hal 0005 · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Beijing_Wangfujing_20170806.jpg" },
  'panda-base': { source: require('../../assets/discover/panda-base.webp'), credit: "Kreisverkehrsampel · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Chengdu_Research_Base_Eingang.jpg" },
  'pandas': { source: require('../../assets/discover/pandas.webp'), credit: "J. Patrick Fischer · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Grosser_Panda.JPG" },
  'paomo': { source: require('../../assets/discover/paomo.webp'), credit: "NNU-1-05100104 · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Pita_Bread_Soaked_in_Lamb_Soup.jpg" },
  'paper-cutting': { source: require('../../assets/discover/paper-cutting.webp'), credit: "Lanneixi · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Chinese_Paper_Cutting.png" },
  'peking-duck': { source: require('../../assets/discover/peking-duck.webp'), credit: "City Foodsters · CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Peking_Duck,_2014_(02).jpg" },
  'peking-opera': { source: require('../../assets/discover/peking-opera.webp'), credit: "陈文 from 上海 · CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:IMGP0739_(19415725842).jpg" },
  'qingming': { source: require('../../assets/discover/qingming.webp'), credit: "Qing court painters · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Along_the_River_During_the_Qingming_Festival_(Qing_Court_Version)_08a.jpg" },
  'qixi': { source: require('../../assets/discover/qixi.webp'), credit: "陳枚 · Public domain", url: "https://commons.wikimedia.org/wiki/File:Women_at_the_Qixi_Festival.jpg" },
  'qr-life': { source: require('../../assets/discover/qr-life.webp'), credit: "Shwangtianyuan · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Exit_turnstile_with_Alipay_QR_Code_Scanner_in_Shenzhen_Railway_Station.jpg" },
  'roujiamo': { source: require('../../assets/discover/roujiamo.webp'), credit: "Gary Soup · CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Roujiamo.jpg" },
  'shadow-puppets': { source: require('../../assets/discover/shadow-puppets.webp'), credit: "Pauloleong2002 · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Shadow_play_in_China.jpg" },
  'singles-day': { source: require('../../assets/discover/singles-day.webp'), credit: "KWUGN Mingsa MaMau · CC0", url: "https://commons.wikimedia.org/wiki/File:GD_%E5%BB%A3%E6%9D%B1_Guangdong_%E5%BB%A3%E5%B7%9E_Guangzhou_%E5%A4%A9%E6%B2%B3%E8%B7%AF_598_TianHe_Road_%E7%99%BE%E8%85%A6%E5%8C%AF%E9%9B%BB%E8%85%A6%E5%9F%8E_Buynow_Electronic_Market_mall_shop_DJ_Com_October_2024_R12S.jpg" },
  'spring-festival': { source: require('../../assets/discover/spring-festival.webp'), credit: "Michael Elleray from England, United Kingdom · CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Kung_Hei_Fat_Choi!_(6834861529).jpg" },
  'square-dance': { source: require('../../assets/discover/square-dance.webp'), credit: "彩色琪子 · CC0", url: "https://commons.wikimedia.org/wiki/File:Square_dancing_in_fuding_fujian_china.jpg" },
  'steamed-buns': { source: require('../../assets/discover/steamed-buns.webp'), credit: "Darrylsnow · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Xiaolongbao-breakfast.jpg" },
  'tai-chi': { source: require('../../assets/discover/tai-chi.webp'), credit: "Gauthier DELECROIX - 郭天 from Qingdao, China · CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Morning_routine_(50571166888).jpg" },
  'tanghulu': { source: require('../../assets/discover/tanghulu.webp'), credit: "Zhu Jian · CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Tanghulu-shanghai.jpg" },
  'tea-houses': { source: require('../../assets/discover/tea-houses.webp'), credit: "Daderot · CC0", url: "https://commons.wikimedia.org/wiki/File:Teahouse_-_Chengdu_Culture_Park_-_Chengdu,_China_-_DSC03959.jpg" },
  'teachers-day': { source: require('../../assets/discover/teachers-day.webp'), credit: "Kychn · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:A_view_of_a_classroom_in_Tieling_High_School_01.jpg" },
  'temple-of-heaven': { source: require('../../assets/discover/temple-of-heaven.webp'), credit: "Shujianyang · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Temple_of_Heaven_20160323_01.jpg" },
  'terracotta-army': { source: require('../../assets/discover/terracotta-army.webp'), credit: "xiquinhosilva · CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:51714-Terracota-Army.jpg" },
  'the-bund': { source: require('../../assets/discover/the-bund.webp'), credit: "钉钉 · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:The_Bund_2.jpg" },
  'wenshu': { source: require('../../assets/discover/wenshu.webp'), credit: "Daderot · CC0", url: "https://commons.wikimedia.org/wiki/File:Hall_-_Wenshu_Monastery_-_Chengdu,_China_-_DSC05252.jpg" },
  'winter-solstice': { source: require('../../assets/discover/winter-solstice.webp'), credit: "Alpha from Melbourne, Australia · CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:%E6%B1%A4%E5%9C%86_Cooked_Tang_Yuan_(329781165).jpg" },
  'womens-day': { source: require('../../assets/discover/womens-day.webp'), credit: "Suyash Dwivedi · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Rose_and_carnation_flower_bouquet_01.jpg" },
  'xiaolongbao': { source: require('../../assets/discover/xiaolongbao.webp'), credit: "Maksym Kozlenko · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:2019-02-22_Xiaolongbao_in_%22Taste_Of_Shanghai%22_restaurant,_Sydney,_Australia.jpg" },
  'xiaolongbao-shanghai': { source: require('../../assets/discover/xiaolongbao-shanghai.webp'), credit: "Robigasp · CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Xiaolongbao_Shanghai.jpg" },
  'yu-garden': { source: require('../../assets/discover/yu-garden.webp'), credit: "Stefan Fussan · CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Shanghai_-_Yu_Garden_-_0035.jpg" },
};

// Which photo each place and dish uses. Restaurants show their signature dish.
export const PlacePhoto: Record<string, string> = {
  'forbidden-city': 'forbidden-city', 'temple-of-heaven': 'temple-of-heaven', nanluoguxiang: 'nanluoguxiang', 'the-bund': 'the-bund',
  'yu-garden': 'yu-garden', 'panda-base': 'panda-base', 'kuanzhai-alley': 'kuanzhai-alley', 'terracotta-army': 'terracotta-army',
  'muslim-quarter': 'muslim-quarter', 'siji-minfu': 'peking-duck', 'huguosi-snacks': 'tanghulu', 'lily-vegetarian': 'buddhist-cuisine',
  'jiajia-tangbao': 'xiaolongbao-shanghai', nanxiang: 'steamed-buns', gongdelin: 'buddhas-delight', 'chen-mapo': 'mapo-tofu-2',
  'shu-jiu-xiang': 'hotpot', 'wenshu-vegetarian': 'wenshu', 'lao-sun-jia': 'paomo', 'fan-ji': 'roujiamo',
};

export const DishPhoto: Record<string, string> = {
  'peking-duck': 'peking-duck', xiaolongbao: 'xiaolongbao', 'mapo-tofu': 'mapo-tofu', hotpot: 'hotpot',
  roujiamo: 'roujiamo', biangbiang: 'biangbiang', 'dim-sum': 'buddhas-delight', jianbing: 'jianbing',
};

/** Culture items and festivals use a photo with the same id, when there is one. */
export const photoFor = (id: string | undefined) => (id ? Photos[id] : undefined);
