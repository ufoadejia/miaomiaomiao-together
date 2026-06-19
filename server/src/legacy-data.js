export const BISTU_SCHOOL = {
  legacyId: 'bistu',
  name: '北京信息科技大学',
  abbr: 'BISTU',
  admin: '西风漂流',
  order: 1
};

export const UPSTREAM_CANTEENS = [
  {
    name: '一食堂',
    floors: [
      { name: '一楼', shops: ['黄焖鸡米饭', '麻辣香锅', '兰州拉面', '重庆小面', '煎饼果子', '肉夹馍'] },
      { name: '二楼', shops: ['自助餐', '小炒肉', '酸菜鱼', '煲仔饭', '过桥米线', '铁板烧'] },
      { name: '三楼', shops: ['火锅', '烤肉', '韩式料理', '日式料理', '西餐厅', '甜品站'] }
    ]
  },
  {
    name: '二食堂',
    floors: [
      { name: '一楼', shops: ['沙县小吃', '桂林米粉', '湘菜馆', '川菜馆', '粤菜馆', '饺子馆'] },
      { name: '二楼', shops: ['汉堡王', '肯德基', '必胜客', '赛百味', '奶茶店', '咖啡厅'] },
      { name: '三楼', shops: ['麻辣烫', '冒菜', '干锅', '烤鱼', '烧烤', '小龙虾'] },
      { name: '四楼', shops: ['精致自助', '海鲜餐厅', '牛排馆', '寿司店', '私房菜', '特色火锅'] }
    ]
  }
];

export function cloneFloors(floors) {
  return (floors || []).map((floor) => ({
    name: String(floor.name || ''),
    shops: Array.isArray(floor.shops) ? floor.shops.map(String) : []
  }));
}

export function countCanteenHierarchy(canteens = UPSTREAM_CANTEENS) {
  return canteens.reduce((total, canteen) => {
    const floors = Array.isArray(canteen.floors) ? canteen.floors : [];
    const shops = floors.reduce((sum, floor) => sum + (Array.isArray(floor.shops) ? floor.shops.length : 0), 0);
    return {
      canteens: total.canteens + 1,
      floors: total.floors + floors.length,
      shops: total.shops + shops
    };
  }, { canteens: 0, floors: 0, shops: 0 });
}
