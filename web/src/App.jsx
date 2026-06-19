import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  BadgeCheck,
  ChefHat,
  Dice5,
  ImagePlus,
  LogIn,
  Megaphone,
  RefreshCcw,
  Shield,
  Star,
  UploadCloud
} from 'lucide-react';
import { api } from './api.js';
import dishPlaceholder from './assets/dish-placeholder.svg';

const fallbackSchools = [
  { _id: 'bistu', name: '北京信息科技大学', abbr: 'BISTU' }
];

const fallbackCategories = [
  { id: 'cat-rice', name: '盖饭' },
  { id: 'cat-spicy', name: '麻辣' },
  { id: 'cat-noodle', name: '粉面' },
  { id: 'cat-hot', name: '热菜' },
  { id: 'cat-drink', name: '饮品' }
];

const fallbackDishes = [
  {
    id: 'demo-1',
    name: '黄焖鸡米饭',
    categoryName: '盖饭',
    canteenName: '一食堂',
    floorName: '一楼',
    shopName: '黄焖鸡米饭',
    headline: '午饭前的稳妥答案仍然来自黄焖鸡窗口',
    description: '酱香浓郁，鸡肉和土豆都炖得软糯，适合作为不知道吃什么时的默认选择。',
    imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80',
    avgScore: 4.9,
    ratingCount: 126,
    rankScore: 516
  },
  {
    id: 'demo-2',
    name: '麻辣香锅',
    categoryName: '麻辣',
    canteenName: '一食堂',
    floorName: '一楼',
    shopName: '麻辣香锅',
    headline: '麻辣香锅在多人拼单中继续占据显眼位置',
    description: '可自选荤素，辣度稳定，适合多人拼单。',
    imageUrl: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=80',
    avgScore: 4.7,
    ratingCount: 94,
    rankScore: 488
  },
  {
    id: 'demo-3',
    name: '桂林米粉',
    categoryName: '粉面',
    canteenName: '二食堂',
    floorName: '一楼',
    shopName: '桂林米粉',
    headline: '赶课同学把桂林米粉推上速度榜',
    description: '出餐快，汤粉和拌粉都适合赶课前后。',
    imageUrl: 'https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=900&q=80',
    avgScore: 4.6,
    ratingCount: 72,
    rankScore: 464
  },
  {
    id: 'demo-4',
    name: '酸菜鱼',
    categoryName: '热菜',
    canteenName: '一食堂',
    floorName: '二楼',
    shopName: '酸菜鱼',
    headline: '酸菜鱼靠一口酸辣守住午饭高峰',
    description: '酸辣口味更醒神，午餐时段人气稳定。',
    imageUrl: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=900&q=80',
    avgScore: 4.5,
    ratingCount: 61,
    rankScore: 449
  }
];

const statusText = {
  ACTIVE: '上架',
  OFFLINE: '下架',
  PENDING: '待审',
  REJECTED: '拒绝'
};

function cx(...names) {
  return names.filter(Boolean).join(' ');
}

function scoreText(value) {
  return Number(value || 0).toFixed(1);
}

function headlineForDish(dish) {
  const name = dish.name || '这道菜';
  const count = Number(dish.ratingCount || 0);
  if (dish.headline) return dish.headline;
  if (count >= 20) return `${name}收获${count}张食堂票，继续留在今日版面`;
  if (count > 0) return `${name}拿到${count}张新票，正在冲上风味榜`;
  if (dish.shopName) return `${dish.shopName}把${name}送上今日候选`;
  if (dish.categoryName) return `${name}登上${dish.categoryName}栏目，等待第一张票`;
  return `${name}成为今天的食堂头条候选`;
}

function RatingStars({ onRate }) {
  return (
    <div className="rate-actions" aria-label="评分">
      {[1, 2, 3, 4, 5].map((score) => (
        <button type="button" key={score} onClick={() => onRate(score)} title={`${score} 分`}>
          <Star size={15} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

function DishRow({ dish, index, featured, onRate }) {
  const imageUrl = dish.imageUrl || dishPlaceholder;
  const headline = headlineForDish(dish);
  return (
    <article className={cx('dish-row', featured && 'featured-dish')}>
      <div className="rank-num">{String(index + 1).padStart(2, '0')}</div>
      <div className="dish-image">
        <img src={imageUrl} alt={dish.name || '菜品占位图'} />
      </div>
      <div className="dish-main">
        <div className="dish-title-line">
          <h2>{headline}</h2>
          <span>{dish.name}</span>
          <span>{dish.categoryName || '未分类'}</span>
        </div>
        <p>{dish.description || `${dish.canteenName || '食堂'} ${dish.floorName || ''} ${dish.shopName || ''}`}</p>
        <RatingStars onRate={(score) => onRate(dish.id, score)} />
      </div>
      <div className="score-box">
        <strong>{scoreText(dish.avgScore)}</strong>
        <span>{dish.ratingCount || 0} 人评分</span>
      </div>
    </article>
  );
}

export function App() {
  const [adminVisible] = useState(() => new URLSearchParams(window.location.search).get('admin') === '1');
  const [userToken, setUserToken] = useState(localStorage.getItem('dishUserToken') || '');
  const [adminToken, setAdminToken] = useState(localStorage.getItem('dishAdminToken') || '');
  const [schools, setSchools] = useState(fallbackSchools);
  const [categories, setCategories] = useState(fallbackCategories);
  const [rankings, setRankings] = useState(fallbackDishes);
  const [adminDishes, setAdminDishes] = useState(fallbackDishes);
  const [selectedSchool, setSelectedSchool] = useState(localStorage.getItem('dishSchoolId') || 'bistu');
  const [activeTab, setActiveTab] = useState(() => (adminVisible ? 'admin' : 'rank'));
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [form, setForm] = useState({
    name: '',
    categoryName: '',
    description: '',
    shopName: '',
    floorName: '',
    image: null
  });

  const currentSchool = useMemo(
    () => schools.find((school) => school._id === selectedSchool) || schools[0],
    [schools, selectedSchool]
  );
  const heroDish = rankings[0] || fallbackDishes[0];
  const heroImageUrl = heroDish.imageUrl || dishPlaceholder;
  const heroHeadline = headlineForDish(heroDish);

  async function bootstrap() {
    setLoading(true);
    try {
      let token = userToken;
      if (!token) {
        const login = await api.webLogin(`网页用户${Math.floor(Math.random() * 10000)}`);
        token = login.token;
        localStorage.setItem('dishUserToken', token);
        setUserToken(token);
      }
      const schoolRows = await api.schools();
      setSchools(schoolRows.length ? schoolRows : fallbackSchools);
      const firstSchoolId = selectedSchool || schoolRows[0]?._id || 'bistu';
      setSelectedSchool(firstSchoolId);
      localStorage.setItem('dishSchoolId', firstSchoolId);
      await refreshData(firstSchoolId);
      setMessage('');
    } catch (error) {
      setMessage('暂时没有连上实时数据，先展示示例榜单。');
    } finally {
      setLoading(false);
    }
  }

  async function refreshData(schoolId = selectedSchool) {
    try {
      const [categoryRows, rankedRows] = await Promise.all([
        api.categories(schoolId),
        api.rankings(schoolId)
      ]);
      setCategories(categoryRows.length ? categoryRows : fallbackCategories);
      setRankings(rankedRows.length ? rankedRows : fallbackDishes);
      if (adminToken) {
        const dishes = await api.dishes(schoolId, true);
        setAdminDishes(dishes.length ? dishes : fallbackDishes);
      }
    } catch {
      setCategories(fallbackCategories);
      setRankings(fallbackDishes);
      setAdminDishes(fallbackDishes);
      setMessage('暂时没有连上实时数据，先展示示例榜单。');
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  async function changeSchool(value) {
    setSelectedSchool(value);
    localStorage.setItem('dishSchoolId', value);
    await refreshData(value);
  }

  async function submitDish(event) {
    event.preventDefault();
    setMessage('');
    if (!form.name.trim()) return;

    const optimisticDish = {
      id: `local-${Date.now()}`,
      name: form.name.trim(),
      categoryName: form.categoryName || '新上传',
      canteenName: currentSchool?.name || '食堂',
      floorName: form.floorName,
      shopName: form.shopName,
      description: form.description || '刚刚上传，等待更多同学评分。',
      avgScore: 0,
      ratingCount: 0
    };

    try {
      const payload = new FormData();
      payload.set('schoolId', selectedSchool);
      Object.entries(form).forEach(([key, value]) => {
        if (value) payload.set(key, value);
      });
      await api.uploadDish(userToken, payload);
      setMessage('菜品已上传');
      await refreshData();
    } catch {
      setRankings([optimisticDish, ...rankings]);
      setAdminDishes([optimisticDish, ...adminDishes]);
      setMessage('暂时没有连上实时数据，这条内容已先放进本地预览。');
    } finally {
      setForm({ name: '', categoryName: '', description: '', shopName: '', floorName: '', image: null });
      setActiveTab('rank');
    }
  }

  async function rateDish(dishId, score) {
    try {
      await api.rate(userToken, dishId, score);
      setMessage('评分已更新');
      await refreshData();
    } catch {
      setRankings((items) => items.map((dish) => {
        if (dish.id !== dishId) return dish;
        const ratingCount = (dish.ratingCount || 0) + 1;
        const avgScore = ((dish.avgScore || 0) * (ratingCount - 1) + score) / ratingCount;
        return { ...dish, ratingCount, avgScore };
      }));
      setMessage('暂时没有连上实时数据，这次评分已先在本地预览。');
    }
  }

  async function loginAdmin(event) {
    event.preventDefault();
    try {
      const login = await api.adminLogin(adminPassword);
      localStorage.setItem('dishAdminToken', login.token);
      setAdminToken(login.token);
      setAdminPassword('');
      setMessage('管理后台已登录');
      setAdminDishes(await api.dishes(selectedSchool, true));
    } catch {
      setAdminToken('local-admin-preview');
      setAdminPassword('');
      setMessage('暂时没有连上实时数据，已进入管理预览模式。');
    }
  }

  async function updateStatus(dishId, status) {
    try {
      await api.updateDish(adminToken, dishId, { status });
      await refreshData();
    } catch {
      setAdminDishes((items) => items.map((dish) => dish.id === dishId ? { ...dish, status } : dish));
    }
    setMessage('菜品状态已更新');
  }

  async function saveAnnouncement() {
    if (!announcement.trim()) return;
    try {
      await api.setAnnouncement(adminToken, selectedSchool, announcement);
    } catch {
      // Preview mode keeps the text only in the visible notice.
    }
    setMessage(`公告已保存：${announcement}`);
    setAnnouncement('');
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    try {
      await api.createCategory(adminToken, selectedSchool, newCategory.trim());
      setCategories(await api.categories(selectedSchool));
    } catch {
      setCategories([...categories, { id: `local-${Date.now()}`, name: newCategory.trim() }]);
    }
    setNewCategory('');
  }

  return (
    <main className="magazine-shell">
      <nav className="topbar">
        <div className="logo-mark">喵喵食榜</div>
        <div className="nav-actions">
          <button className={cx(activeTab === 'rank' && 'active')} onClick={() => setActiveTab('rank')}>
            <ArrowDownUp size={16} /> 排行榜
          </button>
          <button className={cx(activeTab === 'upload' && 'active')} onClick={() => setActiveTab('upload')}>
            <UploadCloud size={16} /> 上传菜品
          </button>
          {adminVisible && (
            <button className={cx(activeTab === 'admin' && 'active')} onClick={() => setActiveTab('admin')}>
              <Shield size={16} /> 管理后台
            </button>
          )}
        </div>
        <div className="school-picker">
          <select value={selectedSchool} onChange={(event) => changeSchool(event.target.value)} aria-label="选择学校">
            {schools.map((school) => (
              <option value={school._id} key={school._id}>{school.name}</option>
            ))}
          </select>
          <button className="icon-btn" type="button" onClick={() => refreshData()} title="刷新">
            <RefreshCcw size={17} />
          </button>
        </div>
      </nav>

      {message && <div className="notice">{message}</div>}

      <section className="cover-stage">
        <img className="cover-image" src={heroImageUrl} alt={heroDish.name || '菜品占位图'} />
        <div className="cover-shade" />
        <div className="cover-copy">
          <p className="kicker">CAMPUS FLAVOR GUIDE</p>
          <h1>食堂<br />风味榜</h1>
          <p className="hero-deck">{heroHeadline}</p>
        </div>
        <div className="cover-actions">
          <button className="primary-btn" onClick={() => setActiveTab('upload')}><UploadCloud size={17} /> 上传新菜</button>
          <button className="light-btn"><Dice5 size={17} /> 随机推荐</button>
        </div>
        <div className="cover-issue">
          <span>NO. 01</span>
          <strong>{heroDish.name}</strong>
          <small>{scoreText(heroDish.avgScore)} / {heroDish.ratingCount} 人评分</small>
        </div>
      </section>

      {activeTab === 'rank' && (
        <section className="content-grid">
          <div className="section-heading">
            <h2>今日精选</h2>
            <span>今日榜单</span>
          </div>
          <div className="rank-list">
            {loading && <div className="empty">加载中...</div>}
            {!loading && rankings.map((dish, index) => (
              <DishRow
                dish={dish}
                index={index}
                key={dish.id}
                featured={index === 0}
                onRate={rateDish}
              />
            ))}
          </div>
          <aside className="side-panel">
            <p className="kicker">INDEX</p>
            <h2>分类</h2>
            <div className="category-list">
              {categories.map((category) => <span key={category.id}>{category.name}</span>)}
            </div>
            <h2>榜单热度</h2>
            <p>平均分、评分人数和最近活跃度共同决定排序。</p>
          </aside>
        </section>
      )}

      {activeTab === 'upload' && (
        <form className="upload-desk" onSubmit={submitDish}>
          <div>
            <p className="kicker">UPLOAD DESK</p>
            <h2>像投稿一样上传一道菜</h2>
            <p>名称、分类、描述和图片会进入同一个评分体系；首版支持单图 5MB。</p>
          </div>
          <label>
            菜品名称
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <div className="form-grid">
            <label>
              分类
              <input list="category-list" value={form.categoryName} onChange={(event) => setForm({ ...form, categoryName: event.target.value })} placeholder="盖饭、粉面、饮品..." />
              <datalist id="category-list">
                {categories.map((category) => <option value={category.name} key={category.id} />)}
              </datalist>
            </label>
            <label>
              店铺 / 楼层
              <input value={form.shopName} onChange={(event) => setForm({ ...form, shopName: event.target.value })} placeholder="一食堂 黄焖鸡米饭" />
            </label>
          </div>
          <label>
            描述
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} />
          </label>
          <label className="file-picker">
            <ImagePlus size={20} />
            <span>{form.image ? form.image.name : '上传图片，单图不超过 5MB'}</span>
            <input type="file" accept="image/*" onChange={(event) => setForm({ ...form, image: event.target.files?.[0] || null })} />
          </label>
          <button className="primary-btn" type="submit"><UploadCloud size={18} /> 提交菜品</button>
        </form>
      )}

      {adminVisible && activeTab === 'admin' && (
        <section className="admin-console">
          {!adminToken && (
            <form className="login-card" onSubmit={loginAdmin}>
              <Shield size={28} />
              <h2>Editor Console</h2>
              <label>
                管理密码
                <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} />
              </label>
              <button className="primary-btn" type="submit"><LogIn size={17} /> 登录</button>
            </form>
          )}

          {adminToken && (
            <>
              <div className="admin-tools">
                <label>
                  <Megaphone size={17} /> 公告
                  <input value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="写入学校公告" />
                </label>
                <button type="button" onClick={saveAnnouncement}>保存公告</button>
                <label>
                  <BadgeCheck size={17} /> 新分类
                  <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="分类名" />
                </label>
                <button type="button" onClick={addCategory}>添加分类</button>
              </div>
              <div className="admin-table">
                {adminDishes.map((dish) => (
                  <div className="admin-row" key={dish.id}>
                    <span>{dish.name}</span>
                    <span>{statusText[dish.status] || dish.status || '上架'}</span>
                    <span>{scoreText(dish.avgScore)} / {dish.ratingCount || 0}</span>
                    <div>
                      <button type="button" onClick={() => updateStatus(dish.id, 'ACTIVE')}>上架</button>
                      <button type="button" onClick={() => updateStatus(dish.id, 'OFFLINE')}>下架</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
