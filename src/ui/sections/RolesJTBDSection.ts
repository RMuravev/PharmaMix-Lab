import { PharmaDataStore } from '../../core/store';
import { esc, fmt, rub, pct } from '../../utils/math';

export function renderRolesJTBD(store: PharmaDataStore): void {
  const container = document.getElementById('rolesJtbdSectionRoot');
  if (!container) return;

  container.innerHTML = `
    <div style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:24px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0">🎯 Хаб ролей и задач (Jobs-to-be-Done)</h2>
          <p style="font-size:13px;color:#64748b;margin:4px 0 0">Фокус на ключевых ролях PharmaMix Lab: аналитика, бюджетирование, аудит и причинно-следственный анализ.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap" id="roleTabButtons">
          <button class="role-tab active" data-role="analyst" style="padding:8px 14px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;background:#2563eb;color:#fff;border:none">📈 Marketing Analytics Lead</button>
          <button class="role-tab" data-role="brand" style="padding:8px 14px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;background:#f1f5f9;color:#475569;border:none">💼 Brand Manager</button>
          <button class="role-tab" data-role="cfo" style="padding:8px 14px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;background:#f1f5f9;color:#475569;border:none">💰 CFO / Controller</button>
          <button class="role-tab" data-role="scientist" style="padding:8px 14px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;background:#f1f5f9;color:#475569;border:none">🔬 Data Scientist</button>
        </div>
      </div>

      <div id="roleContentArea" style="background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0">
        <!-- Default: Analyst -->
        <div class="role-pane" data-role-pane="analyst">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 8px">📈 Роль 1: Marketing Analytics Lead (MMM Modeler)</h3>
          <p style="font-size:13px;color:#475569;margin:0 0 16px"><b>Главная работа (Job):</b> Построение, калибровка и сравнение 42+ эконометрических моделей микса маркетинга (Ridge, OLS, Bayesian, Prophet, XGBoost, TCN) с оценкой эластичности и VIF коллинеарности.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">🏆 Турнир моделей (AutoML)</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Автоматический подбор лучшего алгоритма по MAPE и R² с кросс-валидацией.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Покрыто юнит-тестами (Vitest)</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">⚠️ Контроль мультиколлинеарности (VIF)</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Расчет матрицы VIF для рекламных каналов и рыночного индекса.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Покрыто юнит-тестами (Vitest)</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">⏳ Оптимизация лагов (Adstock)</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Оценка эффекта памяти рекламы и времени отклика потребителя.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Активно в воркере вычислений</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const buttons = container.querySelectorAll('.role-tab');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => {
        (b as HTMLElement).style.background = '#f1f5f9';
        (b as HTMLElement).style.color = '#475569';
      });
      (btn as HTMLElement).style.background = '#2563eb';
      (btn as HTMLElement).style.color = '#fff';

      const role = btn.getAttribute('data-role');
      const contentArea = document.getElementById('roleContentArea');
      if (!contentArea) return;

      if (role === 'analyst') {
        contentArea.innerHTML = `
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 8px">📈 Роль 1: Marketing Analytics Lead (MMM Modeler)</h3>
          <p style="font-size:13px;color:#475569;margin:0 0 16px"><b>Главная работа (Job):</b> Построение, калибровка и сравнение 42+ эконометрических моделей микса маркетинга (Ridge, OLS, Bayesian, Prophet, XGBoost, TCN) с оценкой эластичности и VIF коллинеарности.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">🏆 Турнир моделей (AutoML)</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Автоматический подбор лучшего алгоритма по MAPE и R² с кросс-валидацией.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Покрыто юнит-тестами (Vitest)</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">⚠️ Контроль мультиколлинеарности (VIF)</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Расчет матрицы VIF для рекламных каналов и рыночного индекса.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Покрыто юнит-тестами (Vitest)</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">⏳ Оптимизация лагов (Adstock)</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Оценка эффекта памяти рекламы и времени отклика потребителя.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Активно в воркере вычислений</div>
            </div>
          </div>
        `;
      } else if (role === 'brand') {
        contentArea.innerHTML = `
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 8px">💼 Роль 2: Brand Manager & Commercial Director</h3>
          <p style="font-size:13px;color:#475569;margin:0 0 16px"><b>Главная работа (Job):</b> Оптимизация промо-микса и бюджетов между каналами (Digital, TV, Pharmacies, Reps) для максимизации инкрементальной прибыли и ROMI с учетом S-образного насыщения.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">💰 Байесовский бюджетизатор</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Перераспределение бюджета с расчетом 95% доверительного интервала (Монте-Карло).</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Покрыто юнит-тестами (Vitest)</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">📊 Анализ механик и сетей</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Оценка эффективности скидок, бонусов и аптечных сетей (Apteki, Rigla и др.).</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Доступно в модуле Promo</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">🌍 Региональное планирование</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Сегментация по регионам (Москва, СПб, регионы) с учетом сезонности.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Интегрировано в дашборды</div>
            </div>
          </div>
        `;
      } else if (role === 'cfo') {
        contentArea.innerHTML = `
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 8px">💰 Роль 3: CFO & Financial Controller</h3>
          <p style="font-size:13px;color:#475569;margin:0 0 16px"><b>Главная работа (Job):</b> Контроль финансовых рисков, верификация ROI и чистой выручки, аудит качества данных и выявление аномалий.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">🔍 Аудит качества данных</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Проверка рыночных долей на 100%, поиск сиротских промо-записей и дублей.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Покрыто юнит-тестами (Vitest)</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">📉 Валидация вне выборки (OOS)</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Проверка стабильности коэффициентов и предотвращение переобучения.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Проверка MAPE на тестовой выборке</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">📑 Финансовая отчетность</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Экспорт полных отчетов в Excel и PDF со всеми метриками маржинальности.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Доступен экспорт в один клик</div>
            </div>
          </div>
        `;
      } else if (role === 'scientist') {
        contentArea.innerHTML = `
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 8px">🔬 Data Scientist & Causal Inference Engineer</h3>
          <p style="font-size:13px;color:#475569;margin:0 0 16px"><b>Главная работа (Job):</b> Разработка причинно-следственного анализа, проведение гео-экспериментов (Geo A/B & Difference-in-Differences) и синтетического контроля для оценки истинного инкремента.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">🧪 Гео A/B (DiD & Synthetic Control)</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Сравнение обработанных городов с подобранным синтетическим контролем.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Покрыто юнит-тестами (Vitest)</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">🦠 Сезонный анализ заболеваемости</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Интеграция эпидемиологических данных (ОРВИ, грипп) и корреляций.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Интегрировано в сезонный модуль</div>
            </div>
            <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e2e8f0">
              <div style="font-weight:600;font-size:13px;color:#0f172a">⚡ Асинхронные воркеры вычислений</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">Вынос тяжелых расчетов в Dedicated Web Worker без блокировки интерфейса.</div>
              <div style="margin-top:10px;font-size:11px;color:#16a34a;font-weight:600">✅ Работает стабильно</div>
            </div>
          </div>
        `;
      }
    });
  });
}
