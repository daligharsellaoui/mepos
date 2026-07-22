import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

export const useImportStore = defineStore('import', () => {
  const uploadedFile = ref(null)
  const validationResult = ref(null)
  const importResult = ref(null)
  const currentStep = ref(0) // 0: upload, 1: validating, 2: preview, 3: resolve, 4: confirm, 5: importing
  const isLoading = ref(false)
  const error = ref(null)

  const validRows = computed(() => {
    if (!validationResult.value) return []
    return validationResult.value.rows?.filter(r => r.valid) || []
  })

  const errorRows = computed(() => {
    if (!validationResult.value) return []
    return validationResult.value.rows?.filter(r => !r.valid) || []
  })

  const totalProducts = computed(() => validRows.value.length)
  const hasErrors = computed(() => errorRows.value.length > 0)

  async function downloadTemplate() {
    try {
      const response = await api.downloadCsvTemplate()
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'template_produits.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      error.value = err.response?.data?.message || 'Erreur lors du téléchargement'
      throw err
    }
  }

  async function uploadAndValidate(file) {
    isLoading.value = true
    error.value = null
    uploadedFile.value = file
    currentStep.value = 1 // Validating

    try {
      const { data: res } = await api.validateCsv(file)
      if (res.status === 'success') {
        validationResult.value = res.data
        currentStep.value = 2 // Preview
      } else {
        throw new Error(res.message || 'Validation failed')
      }
    } catch (err) {
      error.value = err.response?.data?.message || err.message || 'Erreur de validation'
      currentStep.value = 0
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function executeImport() {
    isLoading.value = true
    error.value = null
    currentStep.value = 5 // Importing

    try {
      const rows = validRows.value
      const { data: res } = await api.executeImport({ rows })
      if (res.status === 'success') {
        importResult.value = res.data
        currentStep.value = 6 // Done
      } else {
        throw new Error(res.message || 'Import failed')
      }
    } catch (err) {
      error.value = err.response?.data?.message || err.message || "Erreur d'import"
      currentStep.value = 4
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function reset() {
    uploadedFile.value = null
    validationResult.value = null
    importResult.value = null
    currentStep.value = 0
    isLoading.value = false
    error.value = null
  }

  function goToStep(step) {
    currentStep.value = step
  }

  return {
    uploadedFile,
    validationResult,
    importResult,
    currentStep,
    isLoading,
    error,
    validRows,
    errorRows,
    totalProducts,
    hasErrors,
    downloadTemplate,
    uploadAndValidate,
    executeImport,
    reset,
    goToStep
  }
})
