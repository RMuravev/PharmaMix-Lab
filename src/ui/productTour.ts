import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export function startProductTour() {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    steps: [
      { 
        element: '#nav', 
        popover: { 
          title: 'Навигация', 
          description: 'Используйте боковую панель для переключения между разделами платформы: от общих KPI до детальных эконометрических моделей.', 
          side: "right", 
          align: 'start' 
        } 
      },
      { 
        element: 'button[data-page="overview"]', 
        popover: { 
          title: 'Обзор', 
          description: 'Главная страница с ключевыми метриками бизнеса: выручка, доля рынка и ROI промо.', 
          side: "right" 
        } 
      },
      { 
        element: 'button[data-page="automl"]', 
        popover: { 
          title: 'AutoML & SHAP', 
          description: 'Здесь происходит магия: платформа автоматически тестирует 42 модели для каждого бренда и объясняет их работу через SHAP-факторы.', 
          side: "right" 
        } 
      },
      {
        element: '#runAutoMLBtn',
        popover: {
          title: 'Запуск анализа',
          description: 'Нажмите эту кнопку, чтобы запустить полный цикл AutoML турнира для всех брендов.',
          side: "bottom"
        }
      },
      {
        element: '#automlMarginInput',
        popover: {
          title: 'Параметры маржи',
          description: 'Укажите валовую маржу (%) для точного расчета ROAS и прибыли в симуляторе.',
          side: "bottom"
        }
      },
      { 
        element: '#globalBrandSelect', 
        popover: { 
          title: 'Глобальные фильтры в шапке', 
          description: 'Выбирайте бренд, регион и аптечную сеть прямо в шапке — все графики, эконометрика и турнир ML-моделей мгновенно пересчитываются под выбранный срез.', 
          side: "bottom" 
        } 
      },
      {
        element: '#simTrpSlider',
        popover: {
          title: 'Что-Если Симулятор',
          description: 'Передвигайте слайдеры, чтобы увидеть, как изменение бюджета повлияет на прогнозные продажи в реальном времени.',
          side: "top"
        }
      },
      { 
        element: 'button[data-page="data"]', 
        popover: { 
          title: 'Загрузка данных', 
          description: 'Загружайте свои файлы (CSV/XLSX) здесь. Платформа поддерживает 6 типов источников, включая внешние данные по заболеваемости.', 
          side: "right" 
        } 
      },
      {
        element: '#loadFiles',
        popover: {
          title: 'Применение данных',
          description: 'После загрузки файлов нажмите «Применить», чтобы обновить все расчеты в системе.',
          side: "left"
        }
      },
      { 
        element: '#btnStartTour', 
        popover: { 
          title: 'Справка', 
          description: 'Вы всегда можете запустить этот тур снова, если что-то забудете.', 
          side: "bottom" 
        } 
      }
    ]
  });

  driverObj.drive();
}
