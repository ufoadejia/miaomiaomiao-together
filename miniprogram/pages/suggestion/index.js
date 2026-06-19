const api = require('../../utils/api')

Page({
  data: {
    content: '',
    contact: '',
    canSubmit: false,
    submitting: false
  },

  onContentInput(e) {
    const content = e.detail.value
    this.setData({ 
      content,
      canSubmit: content.trim().length > 0
    })
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value })
  },

  async submitSuggestion() {
    if (!this.data.canSubmit || this.data.submitting) {
      return
    }

    this.setData({ submitting: true })

    try {
      const res = await api.callFunction({
          action: 'submitSuggestion',
          data: {
            type: '建议',
            content: this.data.content.trim(),
            contact: this.data.contact.trim()
          }
        })

      if (res.result && res.result.success) {
        wx.showToast({
          title: '提交成功',
          icon: 'success',
          duration: 2000
        })

        setTimeout(() => {
          wx.navigateBack()
        }, 2000)
      } else {
        throw new Error(res.result.message || '提交失败')
      }
    } catch (e) {
      console.error('提交建议失败', e)
      wx.showToast({
        title: e.message || '提交失败，请重试',
        icon: 'none',
        duration: 2000
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
