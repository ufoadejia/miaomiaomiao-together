const api = require('../../utils/api')

let videoAd = null
let lastAdShowTime = 0

Page({
  data: {
    result: {
      canteen: '',
      floor: '',
      shop: ''
    },
    rollingData: {
      canteen: '',
      floor: '',
      shop: ''
    },
    isRolling: false,
    hasResult: false,
    showResultModal: false,
    stats: {
      total: 0,
      today: 0
    },
    titleTapCount: 0,
    lastTapTime: 0,
    showPasswordModal: false,
    passwordInput: '',
    canteenData: [],
    selectedCanteens: ['all'],
    announcement: '',
    totalShopCount: 0,
    canteenShopCounts: [],
    schoolList: [],
    currentSchool: {
      _id: '',
      name: '',
      abbr: ''
    },
    showSchoolPickerModal: false,
    schoolSearchKeyword: '',
    recentSchools: [],
    filteredSchoolList: [],
    displaySchoolList: [],
    isSchoolListEmpty: false,
    lotteryHistory: {},
    reputationStats: {
      count: 0,
      list: []
    },
    showReputationModal: false,
    videoAdLoaded: false
  },

  onLoad() {
    this.loadLotteryHistory()
    this.loadRecentSchools()
    this.loadSchools()
    this.loadStats()
    this.initVideoAd()
  },

  initVideoAd() {
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({
        adUnitId: 'adunit-b1d6ecc904b083a7'
      })
      videoAd.onLoad(() => {
        this.setData({ videoAdLoaded: true })
      })
      videoAd.onError((err) => {
        console.error('激励视频广告加载失败', err)
        this.setData({ videoAdLoaded: false })
      })
      videoAd.onClose((res) => {
        if (res && res.isEnded) {
          lastAdShowTime = Date.now()
          this.setData({ showReputationModal: true })
        } else {
          wx.showToast({
            title: '观看完整视频才能查看榜单',
            icon: 'none',
            duration: 2000
          })
        }
      })
    }
  },

  loadRecentSchools() {
    try {
      const recent = wx.getStorageSync('recentSchools') || []
      this.setData({ recentSchools: recent })
    } catch (e) {
      console.log('加载最近使用学校失败', e)
    }
  },

  loadLotteryHistory() {
    try {
      const history = wx.getStorageSync('lotteryHistory') || {}
      this.setData({ lotteryHistory: history })
    } catch (e) {
      console.log('加载抽奖历史失败', e)
    }
  },

  saveLotteryResult(shopKey) {
    try {
      const history = this.data.lotteryHistory
      history[shopKey] = (history[shopKey] || 0) + 1
      this.setData({ lotteryHistory: history })
      wx.setStorageSync('lotteryHistory', history)
    } catch (e) {
      console.log('保存抽奖历史失败', e)
    }
  },

  onPullDownRefresh() {
    const schoolId = this.data.currentSchool._id
    if (schoolId) {
      this.loadStats()
      this.loadCanteenData()
      this.loadAnnouncement()
      this.loadReputationStats()
    } else {
      this.loadSchools()
      this.loadStats()
    }
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 500)
  },

  async loadSchools() {
    try {
      const res = await api.callFunction({ action: 'getSchools' })

      let schoolList = []

      if (res.result && res.result.success && res.result.data) {
        schoolList = res.result.data
      }

      const bistuSchool = schoolList.find(s => s._id === 'bistu')
      if (!bistuSchool) {
        schoolList.unshift({
          _id: 'bistu',
          name: '北京信息科技大学',
          abbr: 'BISTU',
          admin: '西风漂流'
        })
      }

      this.setData({ schoolList })

      const savedSchool = wx.getStorageSync('selectedSchool')
      if (savedSchool) {
        const existSchool = schoolList.find(s => s._id === savedSchool._id)
        if (existSchool) {
          this.setData({ currentSchool: existSchool }, () => {
            this.loadCanteenData()
            this.loadAnnouncement()
            this.loadReputationStats()
          })
          return
        }
      }

      const defaultSchool = schoolList.find(s => s._id === 'bistu')
      if (defaultSchool) {
        this.setData({ currentSchool: defaultSchool }, () => {
          wx.setStorageSync('selectedSchool', defaultSchool)
          this.loadCanteenData()
          this.loadAnnouncement()
          this.loadReputationStats()
        })
      }
    } catch (e) {
      console.log('加载学校列表失败', e)
    }
  },

  showSchoolPicker() {
    this.setData({
      showSchoolPickerModal: true,
      schoolSearchKeyword: '',
      filteredSchoolList: this.data.schoolList,
      displaySchoolList: this.data.schoolList,
      isSchoolListEmpty: this.data.schoolList.length === 0
    })
  },

  closeSchoolPicker() {
    this.setData({
      showSchoolPickerModal: false,
      schoolSearchKeyword: ''
    })
  },

  onSchoolSearchInput(e) {
    const keyword = e.detail.value.trim().toLowerCase()
    this.setData({ schoolSearchKeyword: keyword })

    if (!keyword) {
      this.setData({
        filteredSchoolList: this.data.schoolList,
        displaySchoolList: this.data.schoolList,
        isSchoolListEmpty: this.data.schoolList.length === 0
      })
      return
    }

    const filtered = this.data.schoolList.filter(school =>
      school.name.toLowerCase().includes(keyword) ||
      (school.abbr && school.abbr.toLowerCase().includes(keyword))
    )
    this.setData({
      filteredSchoolList: filtered,
      displaySchoolList: filtered,
      isSchoolListEmpty: filtered.length === 0
    })
  },

  saveToRecentSchools(school) {
    let recent = this.data.recentSchools.filter(s => s._id !== school._id)
    recent.unshift(school)
    recent = recent.slice(0, 5)
    this.setData({ recentSchools: recent })
    wx.setStorageSync('recentSchools', recent)
  },

  selectSchool(e) {
    const school = e.currentTarget.dataset.school
    this.saveToRecentSchools(school)
    this.setData({
      currentSchool: school,
      showSchoolPickerModal: false,
      schoolSearchKeyword: ''
    }, () => {
      wx.setStorageSync('selectedSchool', school)
      this.loadCanteenData()
      this.loadAnnouncement()
      this.loadReputationStats()
    })
  },

  async loadCanteenData() {
    const schoolId = this.data.currentSchool._id
    if (!schoolId) return

    try {
      const res = await api.callFunction({
          action: 'getCanteenData',
          schoolId: schoolId
        })

      if (res.result && res.result.success && res.result.data) {
        this.setData({ canteenData: res.result.data })
        this.calculateShopCounts()
      } else {
        await this.initCanteenData()
      }
    } catch (e) {
      console.log('加载食堂数据失败', e)
      await this.initCanteenData()
    }
  },

  calculateShopCounts() {
    const canteenData = this.data.canteenData
    let total = 0
    const counts = []

    canteenData.forEach(canteen => {
      let canteenTotal = 0
      const floors = canteen.floors || []
      floors.forEach(floor => {
        canteenTotal += (floor.shops || []).length
      })
      total += canteenTotal
      counts.push({
        _id: canteen._id,
        name: canteen.name,
        count: canteenTotal
      })
    })

    this.setData({
      totalShopCount: total,
      canteenShopCounts: counts
    })
  },

  async initCanteenData() {
    const schoolId = this.data.currentSchool._id
    if (!schoolId) return

    try {
      const res = await api.callFunction({
          action: 'initCanteenData',
          schoolId: schoolId
        })

      if (res.result && res.result.success) {
        await this.loadCanteenData()
      }
    } catch (e) {
      console.log('初始化数据失败', e)
    }
  },

  async loadStats() {
    try {
      const res = await api.callFunction({ action: 'getStats' })

      if (res.result && res.result.success) {
        this.setData({ stats: res.result.data })
      }
    } catch (e) {
      console.log('加载统计数据失败', e)
    }
  },

  async loadAnnouncement() {
    const schoolId = this.data.currentSchool._id
    if (!schoolId) return

    try {
      const res = await api.callFunction({
          action: 'getAnnouncement',
          schoolId: schoolId
        })

      if (res.result && res.result.success) {
        this.setData({ announcement: res.result.data })
      }
    } catch (e) {
      console.log('加载公告失败', e)
    }
  },

  async incrementStats() {
    const schoolId = this.data.currentSchool._id
    try {
      const res = await api.callFunction({
          action: 'incrementStats',
          schoolId: schoolId
        })

      if (res.result && res.result.success && res.result.data) {
        this.setData({ stats: res.result.data })
      }
    } catch (e) {
      console.log('更新统计数据失败', e)
    }
  },

  async loadReputationStats() {
    const schoolId = this.data.currentSchool._id
    if (!schoolId) return

    try {
      const res = await api.callFunction({
          action: 'getReputationStats',
          schoolId: schoolId
        })

      if (res.result && res.result.success) {
        this.setData({ reputationStats: res.result.data })
      }
    } catch (e) {
      console.log('加载人气榜单失败', e)
    }
  },

  async addToReputationShop() {
    const schoolId = this.data.currentSchool._id
    const shopName = this.data.result.shop

    if (!schoolId || !shopName) return

    try {
      const res = await api.callFunction({
          action: 'addToReputationShop',
          schoolId: schoolId,
          data: { shopName: shopName }
        })
      if (res.result && res.result.success && res.result.data) {
        this.setData({ reputationStats: res.result.data })
      }
    } catch (e) {
      console.log('添加人气店铺失败', e)
    }
  },

  showReputationList() {
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    const timeSinceLastAd = now - lastAdShowTime

    if (timeSinceLastAd < fiveMinutes) {
      this.setData({ showReputationModal: true })
      return
    }

    if (Math.random() > 0.5) {
      this.setData({ showReputationModal: true })
      return
    }

    if (!videoAd) {
      this.setData({ showReputationModal: true })
      return
    }

    videoAd.show().catch(() => {
      videoAd.load()
        .then(() => videoAd.show())
        .catch(err => {
          console.error('激励视频广告显示失败', err)
          this.setData({ showReputationModal: true })
        })
    })
  },

  closeReputationModal() {
    this.setData({ showReputationModal: false })
  },

  onTitleTap() {
    const now = Date.now()
    const timeDiff = now - this.data.lastTapTime

    if (timeDiff < 2000) {
      this.setData({
        titleTapCount: this.data.titleTapCount + 1
      })
    } else {
      this.setData({
        titleTapCount: 1
      })
    }

    this.setData({ lastTapTime: now })

    if (this.data.titleTapCount >= 6) {
      this.setData({
        titleTapCount: 0,
        showPasswordModal: true
      })
    }
  },

  onCanteenChange(e) {
    const canteen = e.currentTarget.dataset.canteen
    let selectedCanteens = [...this.data.selectedCanteens]

    if (canteen === 'all') {
      if (selectedCanteens.includes('all')) {
        return
      }
      selectedCanteens = ['all']
    } else {
      if (selectedCanteens.includes('all')) {
        selectedCanteens = [canteen]
      } else if (selectedCanteens.includes(canteen)) {
        selectedCanteens = selectedCanteens.filter(id => id !== canteen)
        if (selectedCanteens.length === 0) {
          selectedCanteens = ['all']
        }
      } else {
        selectedCanteens.push(canteen)
      }
    }

    this.setData({ selectedCanteens })
  },

  onPasswordInput(e) {
    this.setData({ passwordInput: e.detail.value })
  },

  closePasswordModal() {
    this.setData({
      showPasswordModal: false,
      passwordInput: ''
    })
  },

  async confirmPassword() {
    try {
      const res = await api.callFunction({
          action: 'verifyPassword',
          data: { password: this.data.passwordInput }
        })

      if (res.result && res.result.success) {
        const { role, schoolId, schoolName } = res.result.data
        this.closePasswordModal()

        if (role === 'master') {
          wx.navigateTo({
            url: '/pages/masterAdmin/index'
          })
        } else {
          wx.navigateTo({
            url: `/pages/admin/index?schoolId=${schoolId}&schoolName=${encodeURIComponent(schoolName)}`
          })
        }
      } else {
        wx.showToast({
          title: '密码错误',
          icon: 'error',
          duration: 1500
        })
      }
    } catch (e) {
      console.log('密码验证失败', e)
      wx.showToast({
        title: '验证失败',
        icon: 'error',
        duration: 1500
      })
    }
  },

  getRandomItem() {
    const canteenData = this.data.canteenData
    const selectedCanteens = this.data.selectedCanteens
    const lotteryHistory = this.data.lotteryHistory

    if (!canteenData || canteenData.length === 0) {
      return null
    }

    const isAllSelected = selectedCanteens.includes('all')

    const validItems = []
    canteenData.forEach(canteen => {
      if (!isAllSelected && !selectedCanteens.includes(canteen._id)) {
        return
      }
      const floors = canteen.floors || []
      floors.forEach(floor => {
        const shops = floor.shops || []
        shops.forEach(shop => {
          validItems.push({
            canteen: canteen.name,
            floor: floor.name,
            shop: shop,
            key: `${canteen.name}-${floor.name}-${shop}`
          })
        })
      })
    })

    if (validItems.length === 0) {
      return null
    }

    const maxCount = Math.max(...validItems.map(item => lotteryHistory[item.key] || 0), 1)

    const weightedItems = validItems.map(item => {
      const count = lotteryHistory[item.key] || 0
      const weight = Math.pow(maxCount - count + 1, 2)
      return { ...item, weight }
    })

    const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0)
    let random = Math.random() * totalWeight

    for (const item of weightedItems) {
      random -= item.weight
      if (random <= 0) {
        return item
      }
    }

    return weightedItems[weightedItems.length - 1]
  },

  startLottery() {
    if (this.data.isRolling) return

    if (!this.data.canteenData || this.data.canteenData.length === 0) {
      wx.showToast({
        title: '暂无食堂数据，请稍后重试',
        icon: 'none'
      })
      return
    }

    const selectedCanteens = this.data.selectedCanteens
    const isAllSelected = selectedCanteens.includes('all')
    let hasValidShop = false

    for (const canteen of this.data.canteenData) {
      if (!isAllSelected && !selectedCanteens.includes(canteen._id)) {
        continue
      }
      const floors = canteen.floors || []
      for (const floor of floors) {
        if ((floor.shops || []).length > 0) {
          hasValidShop = true
          break
        }
      }
      if (hasValidShop) break
    }

    if (!hasValidShop) {
      wx.showToast({
        title: '暂无店铺数据，请联系管理员添加',
        icon: 'none',
        duration: 2500
      })
      return
    }

    this.setData({
      isRolling: true,
      hasResult: false,
      showResultModal: false
    })

    const totalRolls = 20
    let rollCount = 0
    let lastItem = null

    const roll = () => {
      let randomResult = this.getRandomItem()
      while (lastItem && randomResult && randomResult.shop === lastItem.shop) {
        randomResult = this.getRandomItem()
      }

      if (!randomResult) {
        this.setData({ isRolling: false })
        wx.showToast({ title: '数据加载异常，请重试', icon: 'none' })
        return
      }

      lastItem = randomResult
      this.setData({
        rollingData: randomResult
      })

      rollCount++

      if (rollCount < totalRolls) {
        setTimeout(roll, 80)
      } else {
        this.setData({
          isRolling: false,
          hasResult: true,
          result: randomResult
        })
        wx.vibrateShort({ type: 'medium' })
        this.incrementStats()
        this.saveLotteryResult(randomResult.key)

        this.setData({ showResultModal: true })
      }
    }

    roll()
  },

  closeResultModal() {
    this.setData({ showResultModal: false })
  },

  lotteryAgain() {
    this.setData({
      showResultModal: false,
      hasResult: false
    })
    setTimeout(() => {
      this.startLottery()
    }, 100)
  },

  confirmResult() {
    this.setData({
      showResultModal: false
    })
    this.addToReputationShop()
    wx.showToast({
      title: '祝您用餐愉快！',
      icon: 'success',
      duration: 2000
    })
  },

  copyResult() {
    const { canteen, floor, shop } = this.data.result
    const schoolAbbr = this.data.currentSchool.abbr || 'BISTU'
    const text = `【${schoolAbbr}er今天吃什么】\n食堂：${canteen}\n楼层：${floor}\n店铺：${shop}\n\n今天就去吃「${shop}」吧！`

    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      }
    })
  },

  onShareAppMessage() {
    const schoolAbbr = this.data.currentSchool.abbr || 'BISTU'
    return {
      title: `${schoolAbbr}er今天吃什么？来试试随机抽选！`,
      path: '/pages/index/index',
      imageUrl: ''
    }
  },

  onShareTimeline() {
    const schoolName = this.data.currentSchool.name || '北京信息科技大学'
    return {
      title: `${schoolName}今天吃什么？来试试随机抽选！`,
      query: '',
      imageUrl: ''
    }
  },

  goToSuggestion() {
    wx.navigateTo({
      url: '/pages/suggestion/index'
    })
  },

  goToDishes() {
    const schoolId = this.data.currentSchool._id || 'bistu'
    const schoolName = encodeURIComponent(this.data.currentSchool.name || '北京信息科技大学')
    wx.navigateTo({
      url: `/pages/dishes/index?schoolId=${schoolId}&schoolName=${schoolName}`
    })
  },

  goToNewspaper() {
    const schoolName = encodeURIComponent(this.data.currentSchool.name || '北京信息科技大学')
    wx.navigateTo({
      url: `/pages/newspaper/index?schoolName=${schoolName}`
    })
  }
})
