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

  // Track removed rows
  const removedRowNums = ref([])

  // Track edited rows
  const editedRows = ref({})

  const effectiveValidRows = computed(() => {
    return validRows.value.filter(r => !removedRowNums.value.includes(r.rowNum) && r.valid)
  })

  const effectiveTotalProducts = computed(() => effectiveValidRows.value.length)

  function removeRow(rowNum) {
    removedRowNums.value.push(rowNum)
  }

  function restoreRow(rowNum) {
    removedRowNums.value = removedRowNums.value.filter(n => n !== rowNum)
  }

  function editRow(rowNum, updates) {
    editedRows.value[rowNum] = { ...(editedRows.value[rowNum] || {}), ...updates }
    // Update in validation result
    if (validationResult.value) {
      const row = validationResult.value.rows.find(r => r.rowNum === rowNum)
      if (row) {
        Object.assign(row, updates)
        // Re-validate the row after edit
        if (updates.productName !== undefined || updates.sellingPrice !== undefined) {
          row.errors = []
          if (!updates.productName && !row.productName) row.errors.push('Nom du produit manquant')
          if ((updates.sellingPrice !== undefined ? updates.sellingPrice : row.sellingPrice) <= 0) row.errors.push('Prix de vente invalide')
          row.valid = row.errors.length === 0
        }
      }
    }
  }

  async function executeImport() {
    isLoading.value = true
    error.value = null
    currentStep.value = 5 // Importing

    try {
      const rows = effectiveValidRows.value
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
    removedRowNums.value = []
    editedRows.value = {}
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
    removedRowNums,
    editedRows,
    effectiveValidRows,
    effectiveTotalProducts,
    removeRow,
    restoreRow,
    editRow,
    downloadTemplate,
    uploadAndValidate,
    executeImport,
    reset,
    goToStep
  }
})
