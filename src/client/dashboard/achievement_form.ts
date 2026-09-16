/**
 * @fileoverview Manages achievement creation, visual rarity selection, and artwork uploads.
 */

import { LivePreviewManager } from './live_preview.js';
import { AchievementDefinition } from '../../types/achievement.js';
import { RarityTier, inferRarityFromCss, generateRarityCss } from '../../types/rarity.js';

export class AchievementFormHandler {
  private formElement: HTMLFormElement;
  private previewManager: LivePreviewManager;
  private currentEditingId: string | null = null;
  private uploadedImageFileName: string = 'default_badge.svg';
  private onSavedCallback: () => void;
  private onCancelledCallback: () => void;

  private titleInput: HTMLInputElement;
  private descInput: HTMLTextAreaElement;
  private raritySelect: HTMLSelectElement;
  private fileInput: HTMLInputElement;
  private fileLabel: HTMLElement;
  private cancelBtn: HTMLButtonElement | null;
  private editorTitleEl: HTMLElement | null;

  public constructor(
    form: HTMLFormElement,
    previewContainer: HTMLElement,
    onSaved: () => void,
    onCancelled: () => void
  ) {
    this.formElement = form;
    this.previewManager = new LivePreviewManager(previewContainer);
    this.onSavedCallback = onSaved;
    this.onCancelledCallback = onCancelled;

    this.titleInput = form.querySelector('#input-title') as HTMLInputElement;
    this.descInput = form.querySelector('#input-description') as HTMLTextAreaElement;
    this.raritySelect = form.querySelector('#select-rarity') as HTMLSelectElement;
    this.fileInput = form.querySelector('#input-file') as HTMLInputElement;
    this.fileLabel = form.querySelector('#file-name-label') as HTMLElement;
    this.cancelBtn = form.querySelector('#btn-cancel-edit') as HTMLButtonElement | null;
    this.editorTitleEl = document.getElementById('editor-title');

    this.attachEventListeners();
    this.triggerLivePreview();
  }

  private attachEventListeners(): void {
    const inputs = [this.titleInput, this.descInput, this.raritySelect];
    for (const input of inputs) {
      if (input) {
        input.addEventListener('input', () => this.triggerLivePreview());
        input.addEventListener('change', () => this.triggerLivePreview());
      }
    }

    this.fileInput.addEventListener('change', async () => {
      if (this.fileInput.files && this.fileInput.files.length > 0) {
        const file = this.fileInput.files[0];
        await this.handleImageUpload(file);
      }
    });

    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', () => {
        this.resetForm();
        this.onCancelledCallback();
      });
    }

    this.formElement.addEventListener('submit', async (event) => {
      event.preventDefault();
      await this.saveAchievement();
    });
  }

  private async handleImageUpload(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('image', file);

    try {
      this.fileLabel.textContent = `Uploading ${file.name}...`;
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success && result.data?.fileName) {
        this.uploadedImageFileName = result.data.fileName;
        this.fileLabel.textContent = file.name;
        this.triggerLivePreview();
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (uploadError: any) {
      alert(`Image upload error: ${uploadError.message}`);
      this.fileLabel.textContent = 'Upload failed. Try again.';
    }
  }

  public triggerLivePreview(): void {
    const title = this.titleInput.value.trim();
    const description = this.descInput.value.trim();
    const rarity = (this.raritySelect?.value || 'common') as RarityTier;
    const imageSrc = `/images/${this.uploadedImageFileName}`;

    this.applyRarityColor();

    this.previewManager.update(
      this.currentEditingId || 'preview',
      title,
      description,
      imageSrc,
      rarity
    );
  }

  private applyRarityColor(): void {
    if (!this.raritySelect) {
      return;
    }

    const rarityColorMap: Record<RarityTier, string> = {
      mythic: 'var(--lighter-red)',
      legendary: 'var(--lighter-orange)',
      epic: 'var(--lighter-purple)',
      rare: 'var(--lighter-blue)',
      common: 'var(--lighter-green)',
      basic: 'var(--lighter-gray)',
    };

    this.raritySelect.style.color = rarityColorMap[this.raritySelect.value as RarityTier] || 'var(--lightest-gray)';
  }

  public populateForEdit(achievement: AchievementDefinition): void {
    this.currentEditingId = achievement.id;
    this.titleInput.value = achievement.title;
    this.descInput.value = achievement.description;

    const detectedRarity = achievement.rarity || inferRarityFromCss(achievement.customCss);
    if (this.raritySelect) {
      this.raritySelect.value = detectedRarity;
    }

    this.uploadedImageFileName = achievement.imageFileName;
    this.fileLabel.textContent = achievement.imageFileName;

    const submitBtn = this.formElement.querySelector('#btn-submit-achievement') as HTMLButtonElement | null;
    if (submitBtn) {
      submitBtn.textContent = 'Update achievement';
    }

    if (this.cancelBtn) {
      this.cancelBtn.style.display = 'inline-flex';
    }

    if (this.editorTitleEl) {
      this.editorTitleEl.textContent = 'Edit achievement';
    }

    this.triggerLivePreview();
  }

  public resetForm(): void {
    this.currentEditingId = null;
    this.formElement.reset();
    this.uploadedImageFileName = 'default_badge.svg';
    this.fileLabel.textContent = 'Choose an image (PNG, SVG, JPG)';

    if (this.raritySelect) {
      this.raritySelect.value = 'common';
    }

    const submitBtn = this.formElement.querySelector('#btn-submit-achievement') as HTMLButtonElement | null;
    if (submitBtn) {
      submitBtn.textContent = 'Create achievement';
    }

    if (this.cancelBtn) {
      this.cancelBtn.style.display = 'none';
    }

    if (this.editorTitleEl) {
      this.editorTitleEl.textContent = 'New achievement';
    }

    this.triggerLivePreview();
  }

  private async saveAchievement(): Promise<void> {
    const title = this.titleInput.value.trim();
    const description = this.descInput.value.trim();
    const rarity = (this.raritySelect?.value || 'common') as RarityTier;

    if (!title || !description) {
      alert('Title and description are required.');
      return;
    }

    const customCss = generateRarityCss(rarity, this.currentEditingId || 'new');

    const payload = {
      title,
      description,
      rarity,
      customCss,
      imageFileName: this.uploadedImageFileName,
    };

    try {
      let url = '/api/achievements';
      let method = 'POST';

      if (this.currentEditingId) {
        url = `/api/achievements/${this.currentEditingId}`;
        method = 'PUT';
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save achievement');
      }

      this.resetForm();
      this.onSavedCallback();
    } catch (saveError: any) {
      alert(`Save error: ${saveError.message}`);
    }
  }
}
