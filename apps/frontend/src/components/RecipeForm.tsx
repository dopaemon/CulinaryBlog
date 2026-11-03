'use client';

import type {
  CategoryDto,
  DifficultyLevel,
  RecipeDetailDto,
  RecipeEditorDto,
  RecipeEditorIngredientDto,
  RecipeEditorStepDto,
  RecipeImageDto,
  RecipeStatus,
} from '@culinary/shared';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ImageUploader, { type UploadedImage } from '@/components/ImageUploader';
import IngredientsField, { type IngredientFieldValue } from '@/components/IngredientsField';
import StepsField, { type StepFieldValue } from '@/components/StepsField';
import { ApiError } from '@/lib/api';
import { apiAuthed } from '@/lib/auth';

type RecipeFormMode = 'create' | 'edit';
type NutritionKey = 'calories' | 'protein' | 'carbohydrates' | 'fat' | 'fiber' | 'sodium';

interface RecipeFormProps {
  mode: RecipeFormMode;
  recipeId?: string;
}

interface RecipeFormValues {
  title: string;
  description: string;
  categoryId: string;
  difficulty: DifficultyLevel;
  prepTime: string;
  cookTime: string;
  servings: string;
  instructions: string;
  nutrition: Record<NutritionKey, string>;
}

type FieldErrors = Record<string, string[]>;
type RecipeMutationResponse = Pick<RecipeEditorDto, 'id' | 'rowVersion' | 'title' | 'description' | 'categoryId' | 'difficulty' | 'prepTime' | 'cookTime' | 'servings' | 'instructions' | 'nutrition' | 'steps' | 'ingredients' | 'createdAt' | 'updatedAt'> & {
  images?: RecipeEditorDto['images'];
};

const nutritionFields: Array<{ key: NutritionKey; label: string }> = [
  { key: 'calories', label: 'Calories' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbohydrates', label: 'Carbohydrates (g)' },
  { key: 'fat', label: 'Fat (g)' },
  { key: 'fiber', label: 'Fiber (g)' },
  { key: 'sodium', label: 'Sodium (mg)' },
];

function emptyValues(): RecipeFormValues {
  return {
    title: '',
    description: '',
    categoryId: '',
    difficulty: 'Easy',
    prepTime: '',
    cookTime: '',
    servings: '',
    instructions: '',
    nutrition: {
      calories: '', protein: '', carbohydrates: '', fat: '', fiber: '', sodium: '',
    },
  };
}

function asIngredientFieldValue(item: RecipeEditorIngredientDto): IngredientFieldValue {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity === null ? undefined : Number(item.quantity),
    unit: item.unit ?? 'g',
    notes: item.notes ?? '',
    orderIndex: item.orderIndex,
  };
}

function asStepFieldValue(item: RecipeEditorStepDto): StepFieldValue {
  return {
    id: item.id,
    stepNumber: item.stepNumber,
    title: item.title,
    description: item.description,
    timerMinutes: item.timerMinutes ?? undefined,
    imageUrl: item.imageUrl ?? undefined,
  };
}

function asUploadedImage(item: RecipeImageDto): UploadedImage {
  return { id: item.id, url: item.originalUrl, alt: item.altText, isPrimary: item.isPrimary };
}

function firstError(errors: FieldErrors, ...paths: string[]): string | undefined {
  for (const path of paths) {
    const message = errors[path]?.[0];
    if (message) return message;
  }
  return undefined;
}

function normalizeErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {};
  return error.fieldErrors;
}

function isConcurrencyConflict(error: unknown): boolean {
  return error instanceof ApiError && error.problem?.type === 'RECIPE_CONCURRENCY_CONFLICT';
}

function inputError(errors: FieldErrors, path: string): string | undefined {
  return firstError(errors, path, path.replace(/\.(\d+)\./g, '[$1].'));
}

function toNutrition(values: RecipeFormValues['nutrition'], mode: RecipeFormMode): Record<string, number | null> | undefined {
  const result: Record<string, number | null> = {};
  for (const { key } of nutritionFields) {
    const raw = values[key].trim();
    if (mode === 'edit') {
      result[key] = raw === '' ? null : Number(raw);
    } else if (raw !== '') {
      result[key] = Number(raw);
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function toParentPayload(values: RecipeFormValues, mode: RecipeFormMode) {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    categoryId: values.categoryId,
    difficulty: values.difficulty,
    prepTime: Number(values.prepTime),
    cookTime: Number(values.cookTime),
    servings: Number(values.servings),
    instructions: values.instructions.trim(),
    nutrition: toNutrition(values.nutrition, mode),
  };
}

function asRecipeValues(recipe: RecipeDetailDto): RecipeFormValues {
  return {
    title: recipe.title,
    description: recipe.description ?? '',
    categoryId: recipe.category.id,
    difficulty: recipe.difficulty,
    prepTime: String(recipe.prepTimeMinutes),
    cookTime: String(recipe.cookTimeMinutes),
    servings: String(recipe.servings),
    instructions: recipe.instructions,
    nutrition: {
      calories: recipe.nutrition.calories ?? '',
      protein: recipe.nutrition.protein ?? '',
      carbohydrates: recipe.nutrition.carbohydrates ?? '',
      fat: recipe.nutrition.fat ?? '',
      fiber: recipe.nutrition.fiber ?? '',
      sodium: recipe.nutrition.sodium ?? '',
    },
  };
}

function validate(values: RecipeFormValues, ingredients: IngredientFieldValue[], steps: StepFieldValue[]): FieldErrors {
  const errors: FieldErrors = {};
  const add = (key: string, message: string) => { errors[key] = [...(errors[key] ?? []), message]; };
  if (values.title.trim().length < 5 || values.title.trim().length > 200) add('title', 'Tên công thức phải dài từ 5 đến 200 ký tự.');
  if (!values.description.trim() || values.description.trim().length > 2000) add('description', 'Mô tả là bắt buộc và không quá 2000 ký tự.');
  if (!values.categoryId) add('categoryId', 'Vui lòng chọn danh mục.');
  for (const key of ['prepTime', 'cookTime', 'servings'] as const) {
    const number = Number(values[key]);
    if (!Number.isInteger(number) || number < 1) add(key, 'Giá trị phải là số nguyên dương.');
  }
  if (!values.instructions.trim()) add('instructions', 'Hướng dẫn tổng quát là bắt buộc.');
  for (const { key, label } of nutritionFields) {
    const raw = values.nutrition[key].trim();
    if (raw !== '' && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) add(`nutrition.${key}`, `${label} phải là số không âm.`);
  }

  ingredients.forEach((item, index) => {
    const hasContent = item.name.trim() || item.notes.trim() || item.quantity !== undefined;
    if (!hasContent) return;
    if (!item.name.trim()) add(`ingredients.${index}.name`, 'Tên nguyên liệu là bắt buộc.');
    if (item.quantity === undefined || item.quantity <= 0) add(`ingredients.${index}.quantity`, 'Số lượng phải lớn hơn 0.');
    if (!item.unit.trim()) add(`ingredients.${index}.unit`, 'Đơn vị là bắt buộc.');
    if (item.quantity !== undefined && (!Number.isFinite(item.quantity) || item.quantity < 0)) add(`ingredients.${index}.quantity`, 'Số lượng không hợp lệ.');
  });
  steps.forEach((item, index) => {
    const hasContent = item.title.trim() || item.description.trim() || item.timerMinutes !== undefined;
    if (!hasContent) return;
    if (!item.title.trim()) add(`steps.${index}.title`, 'Tiêu đề bước là bắt buộc.');
    if (!item.description.trim()) add(`steps.${index}.description`, 'Mô tả bước là bắt buộc.');
    if (item.timerMinutes !== undefined && (!Number.isInteger(item.timerMinutes) || item.timerMinutes < 0)) add(`steps.${index}.timerMinutes`, 'Thời gian phải là số nguyên không âm.');
  });
  return errors;
}

function activeIngredients(ingredients: IngredientFieldValue[]) {
  return ingredients
    .filter((item) => item.name.trim())
    .map((item, index) => ({
      ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
      ...(item.unit.trim() ? { unit: item.unit.trim() } : {}),
      name: item.name.trim(),
      ...(item.notes.trim() ? { notes: item.notes.trim() } : {}),
      orderIndex: index,
    }));
}

function activeSteps(steps: StepFieldValue[]) {
  return steps
    .filter((item) => item.title.trim() || item.description.trim())
    .map((item, index) => ({
      stepNumber: index + 1,
      title: item.title.trim(),
      description: item.description.trim(),
      ...(item.timerMinutes !== undefined ? { timerMinutes: item.timerMinutes } : {}),
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    }));
}

export default function RecipeForm({ mode, recipeId: initialRecipeId }: RecipeFormProps) {
  const [values, setValues] = useState<RecipeFormValues>(emptyValues);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [ingredients, setIngredients] = useState<IngredientFieldValue[]>([]);
  const [steps, setSteps] = useState<StepFieldValue[]>([]);
  const [initialIngredients, setInitialIngredients] = useState<IngredientFieldValue[]>([]);
  const [initialSteps, setInitialSteps] = useState<StepFieldValue[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [recipeId, setRecipeId] = useState<string | null>(initialRecipeId ?? null);
  const [recipeStatus, setRecipeStatus] = useState<RecipeStatus>('Draft');
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    let cancelled = false;
    void apiAuthed<CategoryDto[]>('/categories')
      .then((data) => { if (!cancelled) setCategories(data); })
      .catch((requestError) => { if (!cancelled) setCategoryError(requestError instanceof Error ? requestError.message : 'Không thể tải danh mục.'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !initialRecipeId) return;
    let cancelled = false;
    void apiAuthed<RecipeDetailDto>(`/recipes/${encodeURIComponent(initialRecipeId)}`)
      .then((recipe) => {
        if (cancelled) return;
        const nextIngredients = recipe.ingredients.map(asIngredientFieldValue);
        const nextSteps = recipe.steps.map(asStepFieldValue);
        setValues(asRecipeValues(recipe));
        setIngredients(nextIngredients);
        setSteps(nextSteps);
        setInitialIngredients(nextIngredients);
        setInitialSteps(nextSteps);
        setImages(recipe.images.map(asUploadedImage));
        setRecipeId(recipe.id);
        setRecipeStatus(recipe.status);
        setRowVersion(recipe.rowVersion);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Không thể tải công thức.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialRecipeId, mode]);

  const isPersisted = Boolean(recipeId);
  const title = mode === 'edit' ? 'Chỉnh sửa công thức' : 'Tạo công thức';
  const subtitle = mode === 'edit' ? 'Cập nhật công thức, nguyên liệu và cách làm.' : 'Lưu bản nháp trước, sau đó thêm ảnh cho công thức.';
  const statusLabel = recipeStatus === 'Published' ? 'Đã xuất bản' : recipeStatus === 'Archived' ? 'Đã lưu trữ' : 'Bản nháp';
  const saveLabel = mode === 'create' && !isPersisted ? 'Lưu bản nháp' : 'Lưu thay đổi';
  const childErrors = useMemo(() => Object.entries(fieldErrors).filter(([key]) => key.startsWith('ingredients.') || key.startsWith('steps.')), [fieldErrors]);

  function updateValue<K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => { const next = { ...current }; delete next[key as string]; return next; });
  }

  function updateNutrition(key: NutritionKey, value: string) {
    setValues((current) => ({ ...current, nutrition: { ...current.nutrition, [key]: value } }));
    setFieldErrors((current) => { const next = { ...current }; delete next[`nutrition.${key}`]; return next; });
  }

  function handleRequestError(requestError: unknown, fallback: string) {
    setFieldErrors(normalizeErrors(requestError));
    if (isConcurrencyConflict(requestError)) {
      setError('Công thức đã được cập nhật ở nơi khác. Hãy sao chép nội dung bạn vừa nhập, tải lại trang để xem phiên bản mới rồi lưu lại.');
    } else {
      setError(requestError instanceof Error ? requestError.message : fallback);
    }
  }

  async function syncIngredients(id: string): Promise<IngredientFieldValue[]> {
    const current = ingredients.filter((item) => item.name.trim());
    const currentIds = new Set(current.flatMap((item) => item.id ? [item.id] : []));
    for (const oldItem of initialIngredients) {
      if (!currentIds.has(oldItem.id ?? '')) {
        if (oldItem.id) await apiAuthed<void>(`/recipes/${id}/ingredients/${oldItem.id}`, { method: 'DELETE' });
      }
    }

    const saved: IngredientFieldValue[] = [];
    for (const [index, item] of current.entries()) {
      if (item.quantity === undefined || item.quantity <= 0 || !item.unit.trim()) continue;
      const body = { name: item.name.trim(), quantity: item.quantity, unit: item.unit.trim(), ...(item.notes.trim() ? { notes: item.notes.trim() } : {}), orderIndex: index };
      const response = item.id
        ? await apiAuthed<RecipeEditorIngredientDto>(`/recipes/${id}/ingredients/${item.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiAuthed<RecipeEditorIngredientDto>(`/recipes/${id}/ingredients`, { method: 'POST', body: JSON.stringify(body) });
      saved.push(asIngredientFieldValue(response));
    }
    return saved;
  }

  async function syncSteps(id: string): Promise<StepFieldValue[]> {
    const current = steps.filter((item) => item.title.trim() || item.description.trim());
    const currentIds = new Set(current.flatMap((item) => item.id ? [item.id] : []));
    for (const oldItem of initialSteps) {
      if (!currentIds.has(oldItem.id ?? '')) {
        if (oldItem.id) await apiAuthed<void>(`/recipes/${id}/steps/${oldItem.id}`, { method: 'DELETE' });
      }
    }

    const saved: StepFieldValue[] = [];
    for (const item of current) {
      const body = { title: item.title.trim(), description: item.description.trim(), ...(item.timerMinutes !== undefined ? { timerMinutes: item.timerMinutes } : {}), ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}) };
      const response = item.id
        ? await apiAuthed<RecipeEditorStepDto>(`/recipes/${id}/steps/${item.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiAuthed<RecipeEditorStepDto>(`/recipes/${id}/steps`, { method: 'POST', body: JSON.stringify(body) });
      saved.push(asStepFieldValue(response));
    }

    // New steps are appended by the API. Reapply every desired position after all
    // creates so a new step can be inserted between existing steps as well.
    for (const [index, item] of saved.entries()) {
      if (item.id) {
        const response = await apiAuthed<RecipeEditorStepDto>(`/recipes/${id}/steps/${item.id}`, { method: 'PUT', body: JSON.stringify({ title: item.title, description: item.description, ...(item.timerMinutes !== undefined ? { timerMinutes: item.timerMinutes } : {}), ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}), stepNumber: index + 1 }) });
        saved[index] = asStepFieldValue(response);
      }
    }
    return saved.sort((left, right) => left.stepNumber - right.stepNumber);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const effectiveMode: RecipeFormMode = mode === 'edit' || Boolean(recipeId) ? 'edit' : 'create';
    const errors = validate(values, ingredients, steps);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError('Vui lòng kiểm tra lại các trường được đánh dấu.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...toParentPayload(values, effectiveMode),
        ingredients: activeIngredients(ingredients),
        steps: activeSteps(steps),
      };
      let id = recipeId;
      if (mode === 'create' && !id) {
        const created = await apiAuthed<RecipeMutationResponse>('/recipes', { method: 'POST', body: JSON.stringify(payload) });
        id = created.id;
        setRecipeId(created.id);
        setRowVersion(created.rowVersion);
        const savedIngredients = created.ingredients.map(asIngredientFieldValue);
        const savedSteps = created.steps.map(asStepFieldValue);
        setIngredients(savedIngredients);
        setSteps(savedSteps);
        setInitialIngredients(savedIngredients);
        setInitialSteps(savedSteps);
        setNotice('Đã lưu bản nháp. Bạn có thể tải ảnh và đặt ảnh chính ngay bây giờ.');
      } else {
        if (!id || rowVersion === null) throw new Error('Thiếu phiên bản công thức để cập nhật.');
        const updated = await apiAuthed<RecipeMutationResponse>(`/recipes/${id}`, {
          method: 'PUT',
          headers: { 'If-Match': `"${rowVersion}"` },
          body: JSON.stringify(toParentPayload(values, effectiveMode)),
        });
        setRowVersion(updated.rowVersion);
        const [savedIngredients, savedSteps] = await Promise.all([syncIngredients(id), syncSteps(id)]);
        setIngredients(savedIngredients);
        setSteps(savedSteps);
        setInitialIngredients(savedIngredients);
        setInitialSteps(savedSteps);
        setNotice('Đã lưu thay đổi công thức.');
      }
    } catch (requestError) {
      handleRequestError(requestError, mode === 'edit' ? 'Không thể cập nhật công thức.' : 'Không thể lưu bản nháp.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-24 text-sm text-muted-foreground sm:px-6"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Đang tải công thức…</div>;
  }

  return <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Studio</p>
      <h1 className="mt-2 font-display text-3xl sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
    </header>
    {notice && <div className="mt-6 flex gap-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent" role="status"><CheckCircle2 className="h-4 w-4" />{notice}</div>}
    {error && <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
    <form className="mt-8 space-y-8" onSubmit={submit}>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8" aria-labelledby="recipe-basic-title">
        <div className="flex items-start justify-between gap-4"><div><h2 id="recipe-basic-title" className="font-display text-xl">Thông tin cơ bản</h2><p className="mt-1 text-sm text-muted-foreground">Các thông tin chính của công thức.</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{statusLabel}</span></div>
        <div className="mt-6 grid gap-5">
          <label><span className="mb-1.5 block text-sm font-medium">Tên công thức</span><input className="field" value={values.title} onChange={(event) => updateValue('title', event.target.value)} required minLength={5} maxLength={200} placeholder="Gà nướng sa tế" aria-invalid={Boolean(inputError(fieldErrors, 'title'))} />{inputError(fieldErrors, 'title') && <p className="mt-1 text-xs text-destructive">{inputError(fieldErrors, 'title')}</p>}</label>
          <label><span className="mb-1.5 block text-sm font-medium">Mô tả</span><textarea className="field resize-y" value={values.description} onChange={(event) => updateValue('description', event.target.value)} required maxLength={2000} rows={3} aria-invalid={Boolean(inputError(fieldErrors, 'description'))} />{inputError(fieldErrors, 'description') && <p className="mt-1 text-xs text-destructive">{inputError(fieldErrors, 'description')}</p>}</label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label><span className="mb-1.5 block text-sm font-medium">Danh mục</span><select className="field" value={values.categoryId} onChange={(event) => updateValue('categoryId', event.target.value)} required disabled={Boolean(categoryError)} aria-invalid={Boolean(inputError(fieldErrors, 'categoryId'))}><option value="" disabled>{categoryError ?? 'Chọn danh mục'}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{(inputError(fieldErrors, 'categoryId') ?? categoryError) && <p className="mt-1 text-xs text-destructive">{inputError(fieldErrors, 'categoryId') ?? categoryError}</p>}</label>
            <label><span className="mb-1.5 block text-sm font-medium">Độ khó</span><select className="field" value={values.difficulty} onChange={(event) => updateValue('difficulty', event.target.value as DifficultyLevel)}><option value="Easy">Dễ</option><option value="Medium">Trung bình</option><option value="Hard">Khó</option></select>{inputError(fieldErrors, 'difficulty') && <p className="mt-1 text-xs text-destructive">{inputError(fieldErrors, 'difficulty')}</p>}</label>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {([['prepTime', 'Chuẩn bị (phút)'], ['cookTime', 'Nấu (phút)'], ['servings', 'Khẩu phần']] as const).map(([key, label]) => <label key={key}><span className="mb-1.5 block text-sm font-medium">{label}</span><input className="field" type="number" min={1} step={1} value={values[key]} onChange={(event) => updateValue(key, event.target.value)} required aria-invalid={Boolean(inputError(fieldErrors, key))} />{inputError(fieldErrors, key) && <p className="mt-1 text-xs text-destructive">{inputError(fieldErrors, key)}</p>}</label>)}
          </div>
          <label><span className="mb-1.5 block text-sm font-medium">Hướng dẫn tổng quát</span><textarea className="field resize-y" value={values.instructions} onChange={(event) => updateValue('instructions', event.target.value)} required rows={3} aria-invalid={Boolean(inputError(fieldErrors, 'instructions'))} />{inputError(fieldErrors, 'instructions') && <p className="mt-1 text-xs text-destructive">{inputError(fieldErrors, 'instructions')}</p>}</label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8" aria-labelledby="nutrition-title">
        <h2 id="nutrition-title" className="font-display text-xl">Dinh dưỡng <span className="font-sans text-sm font-normal text-muted-foreground">(không bắt buộc)</span></h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{nutritionFields.map(({ key, label }) => <label key={key}><span className="mb-1.5 block text-sm font-medium">{label}</span><input className="field" type="number" min={0} step="0.01" value={values.nutrition[key]} onChange={(event) => updateNutrition(key, event.target.value)} aria-invalid={Boolean(inputError(fieldErrors, `nutrition.${key}`))} />{inputError(fieldErrors, `nutrition.${key}`) && <p className="mt-1 text-xs text-destructive">{inputError(fieldErrors, `nutrition.${key}`)}</p>}</label>)}</div>
      </section>

      <IngredientsField value={ingredients} onChange={setIngredients} disabled={saving} />
      <StepsField value={steps} onChange={setSteps} disabled={saving} />
      {childErrors.length > 0 && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert"><p className="font-semibold">Vui lòng kiểm tra nguyên liệu và các bước:</p><ul className="mt-1 list-disc pl-5">{childErrors.map(([key, messages]) => <li key={key}>{messages[0]}</li>)}</ul></div>}

      {isPersisted && recipeId ? <><ImageUploader recipeId={recipeId} value={images} onChange={setImages} disabled={saving} /><p className="text-sm text-muted-foreground">Ảnh đầu tiên được chọn làm ảnh chính; bạn có thể đổi hoặc xóa ảnh bất kỳ lúc nào.</p></> : <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-5 text-sm text-muted-foreground">Lưu bản nháp trước để tải ảnh lên công thức.</div>}
      <div className="flex justify-end"><button type="submit" disabled={saving || Boolean(categoryError) || (mode === 'edit' && rowVersion === null)} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Đang lưu…' : saveLabel}</button></div>
    </form>
  </div>;
}
