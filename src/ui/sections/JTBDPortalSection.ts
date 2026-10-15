/**
 * JTBD Portal Section (PharmaMix Lab v4)
 * Стартовый портал выбора роли и решения прикладных задач по методологии Jobs-to-be-Done.
 */
import { PharmaDataStore } from '../../core/store';
import { ROLES_REGISTRY, UserRole } from '../../types/pharma';

export function renderJTBDPortal(
  store: PharmaDataStore, 
  onNavigate?: (pageId: string) => void
): void {
  const container = document.getElementById('page-portal');
  if (!container) return;

  const state = store.getState();
  const activeRole = state.activeRole || 'all';

  const roleList: UserRole[] = [
    'analytics',
    'regional',
    'cmo',
    'ds',
    'cfo',
    'board',
    'developer'
  ];

  container.innerHTML = `
    <div class="portal-wrap" style="max-width:1200px;margin:0 auto;padding:10px 0 40px;">
      <!-- Заголовок портала -->
      <div style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%);color:#fff;border-radius:16px;padding:28px 32px;margin-bottom:28px;box-shadow:0 10px 25px -5px rgba(15,23,42,0.3);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px;">
        <div style="max-width:700px;">
          <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(59,130,246,0.2);border:1px solid rgba(147,197,253,0.3);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;color:#93c5fd;margin-bottom:12px;">
            <span>🚀 PharmaMix Lab v4</span>
            <span>•</span>
            <span>Jobs-to-be-Done Навигация</span>
          </div>
          <h1 style="font-size:26px;font-weight:800;letter-spacing:-0.02em;margin:0 0 8px;color:#fff;">
            🎯 Портал ролей & Экспресс-задач
          </h1>
          <p style="font-size:14px;line-height:1.6;color:#cbd5e1;margin:0;">
            Выберите ваш профиль для перехода в специализированное рабочее пространство. 
            Платформа автоматически адаптирует боковое меню, калибрует визуализации и экономит ваше рабочее время.
          </p>
        </div>
        <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);padding:14px 18px;border-radius:12px;text-align:right;">
          <div style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;">Текущий профиль:</div>
          <div style="font-size:16px;font-weight:700;color:#38bdf8;margin-top:2px;">
            ${ROLES_REGISTRY[activeRole]?.icon || '✦'} ${ROLES_REGISTRY[activeRole]?.title || 'Все разделы'}
          </div>
          <button id="portalResetRoleBtn" style="margin-top:8px;padding:4px 10px;font-size:11px;font-weight:600;background:rgba(255,255,255,0.15);border:none;border-radius:6px;color:#fff;cursor:pointer;">
            Сбросить на полный доступ ✦
          </button>
        </div>
      </div>

      <!-- 7 карточек JTBD -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:20px;">
        ${roleList.map(roleKey => {
          const r = ROLES_REGISTRY[roleKey];
          const isCurrent = activeRole === roleKey;
          return `
            <div class="card role-card" data-role-id="${r.id}" style="display:flex;flex-direction:column;justify-content:space-between;border:2px solid ${isCurrent ? '#3b82f6' : '#e2e8f0'};border-radius:14px;padding:22px;background:#fff;transition:all 0.2s ease;box-shadow:${isCurrent ? '0 10px 20px -5px rgba(59,130,246,0.15)' : '0 2px 4px rgba(0,0,0,0.03)'};position:relative;">
              ${isCurrent ? `
                <div style="position:absolute;top:-10px;right:18px;background:#2563eb;color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(37,99,235,0.3);">
                  АКТИВНЫЙ ПРОФИЛЬ
                </div>
              ` : ''}

              <div>
                <!-- Верхняя плашка карточки -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:44px;height:44px;border-radius:10px;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:22px;border:1px solid #bfdbfe;">
                      ${r.icon}
                    </div>
                    <div>
                      <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">${r.title}</h3>
                      <span class="badge ok" style="font-size:11px;padding:2px 6px;margin-top:2px;">${r.badge}</span>
                    </div>
                  </div>
                  <span class="pill" style="background:#f1f5f9;color:#475569;font-size:11px;font-weight:700;white-space:nowrap;">
                    ⏱️ ${r.timeEstimate}
                  </span>
                </div>

                <!-- Блок JTBD задачи -->
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:14px;">
                  <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">🎯 Работа (Job to be done):</div>
                  <div style="font-size:13px;color:#1e293b;line-height:1.45;font-weight:500;">${r.jobToBeDone}</div>
                </div>

                <!-- Решение и результат -->
                <div style="font-size:12px;line-height:1.5;color:#334155;margin-bottom:16px;">
                  <div style="margin-bottom:6px;">
                    <b style="color:#0f172a;">💡 Решение:</b> ${r.solution}
                  </div>
                  <div>
                    <b style="color:#166534;">📈 Результат:</b> <span style="color:#166534;font-weight:600;">${r.result}</span>
                  </div>
                </div>
              </div>

              <!-- Нижняя часть с кнопкой -->
              <div style="border-top:1px solid #f1f5f9;padding-top:14px;margin-top:8px;">
                <button class="btn btn-select-role" data-target-role="${r.id}" data-target-page="${r.primaryPage}" style="width:100%;padding:10px 14px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;background:${isCurrent ? '#2563eb' : '#0f172a'};color:#fff;border:none;transition:background 0.2s;">
                  <span>Войти в рабочее пространство</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Дополнительная секция: Рекомендации по сценариям -->
      <div style="margin-top:32px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px 24px;">
        <h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#0f172a;">
          ⚡ Навигационный компас JTBD платформы
        </h3>
        <p style="font-size:13px;color:#64748b;margin:0 0 16px;">
          Быстрый переход к профильным разделам в зависимости от доступного времени:
        </p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;">
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;cursor:pointer;" class="cluster-compass-card" data-page="top-roi">
            <div style="font-size:12px;font-weight:700;color:#2563eb;">🚀 Быстрые отчеты (до 2 мин)</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">Top ROI Channels, Budget ROI, Executive Brief</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;cursor:pointer;" class="cluster-compass-card" data-page="regional-deepdive">
            <div style="font-size:12px;font-weight:700;color:#0d9488;">🔍 Углубленный анализ (5–15 мин)</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">Regional Deep Dive, Seasonality, Causal DiD</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;cursor:pointer;" class="cluster-compass-card" data-page="whatif-scenarios">
            <div style="font-size:12px;font-weight:700;color:#f59e0b;">⚙️ Планирование (10–30 мин)</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">What-If симулятор, Оптимизация бюджета</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;cursor:pointer;" class="cluster-compass-card" data-page="model-tournament">
            <div style="font-size:12px;font-weight:700;color:#7c3aed;">🤖 Эксперименты (5–10 мин)</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">AutoML 42 модели, OOS валидация, Экспорт</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;cursor:pointer;" class="cluster-compass-card" data-page="data-partitions">
            <div style="font-size:12px;font-weight:700;color:#0284c7;">🛠️ Данные & Hub (2–15 мин)</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">Партиции, Data Quality, Web Worker</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Навешиваем слушатели на кнопки выбора роли
  const roleButtons = container.querySelectorAll('.btn-select-role');
  roleButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetRole = btn.getAttribute('data-target-role') as UserRole;
      const targetPage = btn.getAttribute('data-target-page') || 'overview';
      if (targetRole) {
        store.setRole(targetRole);
        // Синхронизируем селектор в шапке
        const headerSel = document.getElementById('headerRoleSelect') as HTMLSelectElement | null;
        if (headerSel) headerSel.value = targetRole;
        if (onNavigate) {
          onNavigate(targetPage);
        } else {
          // Вызываем глобальную навигацию
          const navBtn = document.querySelector(`button[data-page="${targetPage}"]`) as HTMLButtonElement | null;
          if (navBtn) navBtn.click();
        }
      }
    });
  });

  const resetBtn = document.getElementById('portalResetRoleBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      store.setRole('all');
      const headerSel = document.getElementById('headerRoleSelect') as HTMLSelectElement | null;
      if (headerSel) headerSel.value = 'all';
      renderJTBDPortal(store, onNavigate);
    });
  }
}
