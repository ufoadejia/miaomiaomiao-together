const api = require('../../utils/api')

Page({
  data: {
    schoolList: [],
    showSchoolModal: false,
    isEditing: false,
    editingSchoolId: '',
    schoolForm: {
      name: '',
      abbr: '',
      password: '',
      admin: ''
    },
    allSchoolStats: [],
    globalTotal: 0,
    statsExpanded: true,
    schoolListExpanded: false,
    suggestions: [],
    suggestionsExpanded: false
  },

  onLoad() {
    this.loadSchools()
    this.loadAllSchoolStats()
    this.loadSuggestions()
  },

  toggleStats() {
    this.setData({
      statsExpanded: !this.data.statsExpanded
    })
  },

  toggleSchoolList() {
    this.setData({
      schoolListExpanded: !this.data.schoolListExpanded
    })
  },

  toggleSuggestions() {
    this.setData({
      suggestionsExpanded: !this.data.suggestionsExpanded
    })
  },

  async loadSchools() {
    wx.showLoading({ title: '加载中...' })
    
    try {
      const res = await api.callFunction({ action: 'getSchools' })
      
      if (res.result && res.result.success) {
        this.setData({ schoolList: res.result.data || [] })
      }
    } catch (e) {
      console.log('加载学校列表失败', e)
      wx.showToast({ title: '加载失败', icon: 'error' })
    }
    
    wx.hideLoading()
  },

  async loadAllSchoolStats() {
    try {
      const res = await api.callFunction({ action: 'getAllSchoolStats' })
      
      if (res.result && res.result.success) {
        this.setData({ 
          allSchoolStats: res.result.data.schools || [],
          globalTotal: res.result.data.globalTotal || 0
        })
      }
    } catch (e) {
      console.log('加载学校统计失败', e)
    }
  },

  async loadSuggestions() {
    try {
      const res = await api.callFunction({ action: 'getSuggestions' })
      
      if (res.result && res.result.success) {
        const suggestions = (res.result.data || []).map(item => {
          const date = new Date(item.createdAt)
          const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
          return {
            ...item,
            timeStr
          }
        })
        this.setData({ suggestions })
      }
    } catch (e) {
      console.log('加载建议列表失败', e)
    }
  },

  showAddSchoolModal() {
    this.setData({
      showSchoolModal: true,
      isEditing: false,
      editingSchoolId: '',
      schoolForm: {
        name: '',
        abbr: '',
        password: '',
        admin: ''
      }
    })
  },

  showEditSchoolModal(e) {
    const school = e.currentTarget.dataset.school
    this.setData({
      showSchoolModal: true,
      isEditing: true,
      editingSchoolId: school._id,
      schoolForm: {
        name: school.name,
        abbr: school.abbr || '',
        password: '',
        admin: school.admin || ''
      }
    })
  },

  closeSchoolModal() {
    this.setData({
      showSchoolModal: false,
      schoolForm: {
        name: '',
        abbr: '',
        password: '',
        admin: ''
      }
    })
  },

  onSchoolNameInput(e) {
    this.setData({
      'schoolForm.name': e.detail.value
    })
  },

  onSchoolAbbrInput(e) {
    this.setData({
      'schoolForm.abbr': e.detail.value.toUpperCase()
    })
  },

  onSchoolPasswordInput(e) {
    this.setData({
      'schoolForm.password': e.detail.value
    })
  },

  onSchoolAdminInput(e) {
    this.setData({
      'schoolForm.admin': e.detail.value
    })
  },

  async saveSchool() {
    const { name, abbr, password, admin } = this.data.schoolForm
    
    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入学校名称', icon: 'none' })
      return
    }
    
    if (!abbr || !abbr.trim()) {
      wx.showToast({ title: '请输入英文简称', icon: 'none' })
      return
    }
    
    if (!this.data.isEditing && (!password || !password.trim())) {
      wx.showToast({ title: '请输入管理密码', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '保存中...' })
    
    try {
      const action = this.data.isEditing ? 'updateSchool' : 'addSchool'
      const data = this.data.isEditing ? {
        schoolId: this.data.editingSchoolId,
        name: name.trim(),
        abbr: abbr.trim(),
        admin: admin ? admin.trim() : '',
        ...(password && password.trim() ? { password: password.trim() } : {})
      } : {
        name: name.trim(),
        abbr: abbr.trim(),
        password: password.trim(),
        admin: admin ? admin.trim() : ''
      }
      
      const res = await api.callFunction({ action, data })
      
      if (res.result && res.result.success) {
        if (!this.data.isEditing) {
          const schoolName = name.trim()
          const copyText = `${schoolName}已成功开通！

学校名称：${schoolName}
英文简称：${abbr.trim()}
管理密码：${password.trim()}
管理员：${admin ? admin.trim() : '无'}

小程序搜索"一起哈基米"即可使用，点击标题栏切换学校即可选择${schoolName}。
管理后台：单击六下标题"XXer今天吃什么"进入。
注意：学校开通后需重新进入小程序，才可以在学校列表内找到。

管理教程：
1. 添加分类：点击"+ 添加食堂"，可创建如"一食堂"、"二食堂"、"校外美食街"等分类
2. 添加子分类：点击分类名称展开，添加楼层或区域，如"一楼"、"二楼"、"东区"、"西区"
3. 添加店铺：在每个楼层/区域下添加具体店铺名称
提示：分类名称完全自定义，"食堂-楼层-店铺"只是层层细化的结构，可灵活调整为"校区-区域-店铺"等`
          wx.setClipboardData({
            data: copyText,
            success: () => {
              wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
            }
          })
        } else {
          wx.showToast({ title: '保存成功', icon: 'success' })
        }
        this.closeSchoolModal()
        this.loadSchools()
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'error' })
      }
    } catch (e) {
      console.log('保存学校失败', e)
      wx.showToast({ title: '保存失败', icon: 'error' })
    }
    
    wx.hideLoading()
  },

  deleteSchool(e) {
    const school = e.currentTarget.dataset.school
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${school.name}"吗？删除后该学校的所有数据将无法恢复。`,
      confirmColor: '#ff6b6b',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          
          try {
            const result = await api.callFunction({
                action: 'deleteSchool',
                data: { schoolId: school._id }
              })
            
            if (result.result && result.result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              this.loadSchools()
            } else {
              wx.showToast({ title: '删除失败', icon: 'error' })
            }
          } catch (err) {
            console.log('删除学校失败', err)
            wx.showToast({ title: '删除失败', icon: 'error' })
          }
          
          wx.hideLoading()
        }
      }
    })
  },

  goToBistuAdmin() {
    wx.navigateTo({
      url: '/pages/admin/index?schoolId=bistu&schoolName=' + encodeURIComponent('北京信息科技大学')
    })
  },

  goBack() {
    wx.navigateBack()
  },

  moveSchoolUp(e) {
    const index = e.currentTarget.dataset.index
    if (index === 0) return
    
    const schoolList = [...this.data.schoolList]
    const temp = schoolList[index]
    schoolList[index] = schoolList[index - 1]
    schoolList[index - 1] = temp
    
    this.setData({ schoolList })
    this.saveSchoolOrder()
  },

  moveSchoolDown(e) {
    const index = e.currentTarget.dataset.index
    if (index === this.data.schoolList.length - 1) return
    
    const schoolList = [...this.data.schoolList]
    const temp = schoolList[index]
    schoolList[index] = schoolList[index + 1]
    schoolList[index + 1] = temp
    
    this.setData({ schoolList })
    this.saveSchoolOrder()
  },

  async saveSchoolOrder() {
    const schoolOrders = this.data.schoolList.map(s => s._id)
    
    try {
      await api.callFunction({
          action: 'updateSchoolOrder',
          data: { schoolOrders }
        })
    } catch (e) {
      console.log('保存排序失败', e)
    }
  }
})
