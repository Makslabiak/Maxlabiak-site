import { useState, useEffect, useCallback, useRef } from "react";
import heroBg from "@/imports/Frame1/f58627e262492910beb5cee74a4755f044332fb2.png";

const ACCENT = "#c9f24d";

const problems = [
  "Нет расчёта стоимости — человек уходит искать цену к конкуренту",
  "Форма просит телефон раньше, чем он что-то узнал",
  "Фото со стоков вместо реальных объектов",
  "Ни слова про смету, договор и гарантии — а боятся именно этого",
  "Некому ответить на вопрос здесь и сейчас",
  "Грузится 6 секунд, на телефоне разъезжается",
];

const tools = [
  { name: "Калькулятор по м²", desc: "Считает сам и не уходит за ценой", icon: "📐" },
  { name: "Квиз с подбором", desc: "Отсекает нецелевых до звонка", icon: "✅" },
  { name: "AI-консультант", desc: "Отвечает на вопросы ночью и в выходные", icon: "🤖" },
  { name: "Шторка до/после", desc: "Доказательство вместо обещаний", icon: "🔀" },
  { name: "Блок гарантий", desc: "Смета, договор, сроки, штрафы", icon: "🔒" },
  { name: "Заявка в Telegram", desc: "Отвечаете за минуту, а не за день", icon: "✈️" },
  { name: "Аналитика и цели", desc: "Видно, откуда пришла заявка", icon: "📊" },
];

const cases = [
  {
    label: "Переделали",
    tag: "Массовый сегмент",
    before: 32,
    after: 87,
    img: "https://images.unsplash.com/photo-1689043528099-2ba014dd7c64?w=600&h=400&fit=crop&auto=format",
    desc: "Убрали стоковые фото, добавили калькулятор и квиз. Конверсия выросла с 0.8% до 3.1%.",
  },
  {
    label: "Переделали",
    tag: "Премиум",
    before: 44,
    after: 91,
    img: "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=600&h=400&fit=crop&auto=format",
    desc: "Сделали акцент на реальных объектах и видео. Средний чек вырос на 40%.",
  },
  {
    label: "Сделали с нуля",
    tag: "Дома",
    before: null,
    after: 89,
    img: "https://images.unsplash.com/photo-1630567085480-826f47d6fb5f?w=600&h=400&fit=crop&auto=format",
    desc: "Новый сайт с нуля за 5 дней. 12 заявок в первую неделю после запуска рекламы.",
  },
];

const reviews = [
  {
    quote:
      "За первую неделю получили 8 заявок из Директа. Раньше с того же бюджета — 1-2 в месяц. Максим сделал всё быстро и объяснил, что изменилось.",
    name: "Игорь Стрельников",
    company: "РемСтройМастер",
    url: "#",
  },
  {
    quote:
      "Работали без переписки через менеджера. Прислал фото утром — к вечеру уже был первый экран. Правки принял сразу, без споров. Рекомендую.",
    name: "Анна Власова",
    company: "Уютный Ремонт",
    url: "#",
  },
];

const steps = [
  { num: "1", title: "Бриф", time: "20 мин" },
  { num: "2", title: "Первый экран", time: "2-й день" },
  { num: "3", title: "Сборка", time: "3 дня" },
  { num: "4", title: "Правки", time: "2 круга" },
  { num: "5", title: "Запуск", time: "1 день" },
];

const packages = [
  {
    name: "Лендинг",
    price: "25 000 ₽",
    items: ["Первый экран", "Квиз", "Кейсы", "Блок гарантий", "Заявка в Telegram"],
    highlight: false,
  },
  {
    name: "Лендинг +",
    price: "40 000 ₽",
    items: [
      "Всё из Лендинга",
      "Калькулятор по м²",
      "Шторка до/после",
      "AI-консультант",
      "Аналитика и цели",
    ],
    highlight: true,
  },
  {
    name: "Каталог",
    price: "60 000 ₽",
    items: [
      "Всё из Лендинга +",
      "Каталог услуг",
      "Фильтрация по типу",
      "Страница кейса",
      "Блог / FAQ",
    ],
    highlight: false,
  },
];

const navItems = ["Кейсы", "Стоимость", "Бриф", "О нас"];

// ─── NAV ───────────────────────────────────────────────────────────────────
function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between px-5 sm:px-[70px] pt-[50px] relative">
      <p
        className="text-white text-[22px] sm:text-[25px] tracking-[-0.5px] shrink-0"
        style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
      >
        Dars studio
      </p>

      <div className="relative hidden md:flex">
        <div className="absolute inset-0 backdrop-blur-[10px] bg-white/20 rounded-full" />
        <nav
          className="relative flex items-center gap-5 px-8 py-[11px] text-white text-[16px] tracking-[-0.32px]"
          style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
        >
          {navItems.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="hover:text-[#c9f24d] transition-colors whitespace-nowrap"
            >
              {item}
            </a>
          ))}
        </nav>
      </div>

      <div className="relative hidden md:block">
        <div className="absolute inset-0 backdrop-blur-[10px] bg-white/20 rounded-full" />
        <a
          href="#бриф"
          className="relative block px-7 py-3 text-white text-[16px] tracking-[-0.32px] whitespace-nowrap hover:text-[#c9f24d] transition-colors"
          style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
        >
          Связаться
        </a>
      </div>

      <button
        className="md:hidden text-white p-2"
        onClick={() => setOpen(!open)}
        aria-label="Меню"
      >
        <div className="w-6 flex flex-col gap-1.5">
          <span className={`block h-0.5 bg-white transition-all origin-center ${open ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block h-0.5 bg-white transition-all ${open ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 bg-white transition-all origin-center ${open ? "-rotate-45 -translate-y-2" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="absolute top-[80px] left-0 right-0 z-50 mx-3 rounded-2xl overflow-hidden">
          <div className="backdrop-blur-[20px] bg-black/75 p-6 flex flex-col gap-4">
            {navItems.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-white text-[18px] hover:text-[#c9f24d] transition-colors"
                style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                onClick={() => setOpen(false)}
              >
                {item}
              </a>
            ))}
            <a
              href="#бриф"
              className="mt-2 text-center bg-white text-black px-6 py-3 rounded-full text-[16px] hover:bg-[#c9f24d] transition-colors"
              style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
              onClick={() => setOpen(false)}
            >
              Связаться
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TOOLS SLIDER ──────────────────────────────────────────────────────────
function ToolsSlider() {
  const [active, setActive] = useState(0);
  const count = tools.length;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback(
    (dir: 1 | -1) => {
      setActive((prev) => (prev + dir + count) % count);
    },
    [count]
  );

  useEffect(() => {
    intervalRef.current = setInterval(() => go(1), 3200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [go]);

  const resetInterval = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => go(1), 3200);
  };

  const handlePrev = () => { go(-1); resetInterval(); };
  const handleNext = () => { go(1); resetInterval(); };

  // Scale / opacity / z based on distance from active
  const getStyle = (i: number) => {
    const dist = Math.min(
      Math.abs(i - active),
      Math.abs(i - active + count),
      Math.abs(i - active - count)
    );
    if (dist === 0) return { scale: 1, opacity: 1, zIndex: 10 };
    if (dist === 1) return { scale: 0.82, opacity: 0.7, zIndex: 5 };
    return { scale: 0.65, opacity: 0.4, zIndex: 1 };
  };

  // Build visible order: show up to 5 cards centred on active
  const visible = [-2, -1, 0, 1, 2].map((offset) => ({
    index: (active + offset + count) % count,
    offset,
  }));

  return (
    <div>
      {/* Track */}
      <div className="relative flex items-center justify-center" style={{ height: 340 }}>
        {visible.map(({ index, offset }) => {
          const s = getStyle(index);
          const tool = tools[index];
          // Horizontal shift: each slot is ~260px apart
          const tx = offset * 260;
          return (
            <div
              key={index}
              onClick={() => { setActive(index); resetInterval(); }}
              className="absolute cursor-pointer select-none"
              style={{
                transform: `translateX(${tx}px) scale(${s.scale})`,
                opacity: s.opacity,
                zIndex: s.zIndex,
                transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s ease",
                width: 280,
              }}
            >
              <div
                className="rounded-[20px] flex flex-col justify-between p-7"
                style={{
                  background: s.scale === 1 ? "#111" : "#1c1c1c",
                  border: s.scale === 1 ? `1.5px solid ${ACCENT}40` : "1.5px solid rgba(255,255,255,0.08)",
                  height: 280,
                }}
              >
                <span className="text-4xl">{tool.icon}</span>
                <div>
                  <p
                    className="text-white text-[18px] mb-2 leading-tight"
                    style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                  >
                    {tool.name}
                  </p>
                  <p className="text-white/50 text-[14px] leading-[1.4]">{tool.desc}</p>
                </div>
                {s.scale === 1 && (
                  <div
                    className="w-8 h-1 rounded-full mt-4"
                    style={{ background: ACCENT }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Arrows + dots */}
      <div className="flex items-center justify-center gap-5 mt-6">
        <button
          onClick={handlePrev}
          className="w-11 h-11 rounded-full border border-white/20 flex items-center justify-center text-white hover:border-white/50 transition-colors"
        >
          ←
        </button>

        <div className="flex gap-2">
          {tools.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActive(i); resetInterval(); }}
              className="rounded-full transition-all"
              style={{
                width: i === active ? 24 : 8,
                height: 8,
                background: i === active ? ACCENT : "rgba(255,255,255,0.2)",
              }}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          className="w-11 h-11 rounded-full border border-white/20 flex items-center justify-center text-white hover:border-white/50 transition-colors"
        >
          →
        </button>
      </div>
    </div>
  );
}

// ─── APP ───────────────────────────────────────────────────────────────────
export default function App() {
  const [briefAnswers, setBriefAnswers] = useState<Record<string, string>>({});
  const [briefStep, setBriefStep] = useState(0);
  const [briefDone, setBriefDone] = useState(false);

  const briefQuestions = [
    { id: "segment", question: "Какой сегмент?", options: ["Эконом", "Стандарт", "Премиум"] },
    { id: "city", question: "Город / регион?", options: ["Москва", "СПб", "Другой"] },
    { id: "ads", question: "Откуда ведёте рекламу?", options: ["Директ", "Авито", "Оба"] },
    { id: "site", question: "Есть ли сайт сейчас?", options: ["Есть", "Нет", "Есть, но плохой"] },
    { id: "timeline", question: "Когда нужен запуск?", options: ["Срочно", "1–2 недели", "Не горит"] },
  ];

  const currentQ = briefQuestions[briefStep];

  const handleBriefAnswer = (option: string) => {
    setBriefAnswers((prev) => ({ ...prev, [currentQ.id]: option }));
    if (briefStep < briefQuestions.length - 1) {
      setBriefStep(briefStep + 1);
    } else {
      setBriefDone(true);
    }
  };

  return (
    <div className="bg-[#f5f5f0] min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── 01 HERO ── */}
      <section className="p-4 sm:p-5 relative">
        <div className="relative w-full rounded-[20px] overflow-hidden" style={{ minHeight: 760 }}>
          <img
            src={heroBg}
            alt="Ремонтный объект"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: "center 30%" }}
          />
          <div className="absolute inset-0 bg-black/75" />
          <div className="relative z-10 flex flex-col" style={{ minHeight: 760 }}>
            <Nav />
            <div className="flex flex-col px-5 sm:px-[70px] mt-auto pb-10 sm:pb-[60px]">
              <p className="text-white/60 text-[13px] sm:text-[14px] mb-5 leading-[1.3]">
                Делаю сайты под рекламу{" "}
                <strong style={{ fontFamily: "'Inter', sans-serif", fontWeight: 900 }}>
                  с 2018 года
                </strong>
              </p>
              <h1
                className="text-[clamp(36px,5.5vw,70px)] leading-[1.05] tracking-[-0.02em] text-white max-w-[644px] mb-5"
                style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
              >
                Сайт <span style={{ color: ACCENT }}>под рекламу </span>
                для ремонтных компаний
              </h1>
              <p className="text-white/80 text-[16px] sm:text-[18px] leading-[1.4] max-w-[458px] mb-8">
                Превращает трафик из Директа и Авито в заявки на замер. Расчёт
                стоимости, реальные объекты, заявка сразу в Telegram.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[580px] mb-8">
                <a
                  href="#бриф"
                  className="bg-white rounded-2xl p-5 hover:bg-[#c9f24d] transition-colors cursor-pointer"
                >
                  <p
                    className="text-black text-[16px] sm:text-[18px] mb-2 leading-tight"
                    style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                  >
                    Проверить свой сайт
                  </p>
                  <p className="text-black/60 text-[13px] leading-[1.3]">
                    Проверка покажет, что работает плохо
                  </p>
                  <p className="text-black/40 text-[12px] mt-1">
                    2 минуты, без звонков и переписки
                  </p>
                </a>
                <a
                  href="#бриф"
                  className="rounded-2xl p-5 border border-white/30 backdrop-blur-[10px] bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                >
                  <p
                    className="text-white text-[16px] sm:text-[18px] mb-2 leading-tight"
                    style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                  >
                    Сайта пока нет
                  </p>
                  <p className="text-white/60 text-[13px] leading-[1.3]">
                    Разработаю структуру и назову цену
                  </p>
                  <p className="text-white/40 text-[12px] mt-1">
                    5 вопросов, ответ сразу на экране
                  </p>
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-white/70 text-[15px] sm:text-[17px]">
                {["5 дней", "от 25 000 ₽", "2 круга правок"].map((s, i, a) => (
                  <span key={s} className="flex items-center gap-4 sm:gap-6">
                    <span>{s}</span>
                    {i < a.length - 1 && <span className="opacity-30 text-[10px]">|</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 02 ПРОБЛЕМЫ — sticky left + scrolling cards ── */}
      <section className="px-4 sm:px-5 py-16 sm:py-24">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col lg:flex-row gap-10 lg:gap-0 items-start">

            {/* Sticky heading column — 60% */}
            <div className="lg:w-[60%] lg:sticky lg:top-24 lg:self-start lg:pr-16 shrink-0">
              <h2
                className="text-[clamp(32px,4vw,58px)] leading-[1.08] tracking-[-0.025em] text-black"
                style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
              >
                Почему сайт<br />не даёт заявок
              </h2>
              <p className="text-black/50 text-[16px] leading-[1.55] mt-5 max-w-[360px]">
                Шесть причин, которые встречаются почти на каждом сайте ремонтной компании. Каждая из них режет конверсию.
              </p>
            </div>

            {/* Scrolling cards column — 40% */}
            <div className="lg:w-[40%] flex flex-col gap-4 w-full">
              {problems.map((problem, i) => (
                <div
                  key={i}
                  className="bg-white rounded-[16px] p-6 border border-black/[0.06] hover:border-black/15 transition-colors"
                >
                  <span
                    className="block text-[13px] text-black/20 mb-3 font-bold tracking-wider"
                    style={{ fontFamily: "'Manrope', sans-serif" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[15px] sm:text-[16px] text-black/80 leading-[1.5]">
                    {problem}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 03 ИНСТРУМЕНТЫ — coverflow slider ── */}
      <section
        className="mx-4 sm:mx-5 mb-16 sm:mb-24 rounded-[20px] bg-[#111] px-6 sm:px-12 py-14 sm:py-20 overflow-hidden"
      >
        <div className="max-w-[1400px] mx-auto">
          <h2
            className="text-[clamp(24px,3.5vw,46px)] leading-[1.1] tracking-[-0.02em] text-white max-w-[520px] mb-12"
            style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
          >
            Внедряю инструменты, которые приносят заявки
          </h2>
          <ToolsSlider />
        </div>
      </section>

      {/* ── 04 КЕЙСЫ ── */}
      <section id="кейсы" className="px-4 sm:px-5 mb-16 sm:mb-24">
        <div className="max-w-[1400px] mx-auto">
          <h2
            className="text-[clamp(26px,3.5vw,46px)] leading-[1.1] tracking-[-0.02em] text-black mb-10"
            style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
          >
            Кейсы
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {cases.map((c) => (
              <div
                key={c.tag}
                className="bg-white rounded-[16px] overflow-hidden border border-black/[0.06]"
              >
                <div className="relative h-[220px] bg-black/10">
                  <img src={c.img} alt={c.tag} className="w-full h-full object-cover" />
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span
                      className="bg-black/60 text-white text-[11px] px-3 py-1 rounded-full backdrop-blur-sm"
                      style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                    >
                      {c.label}
                    </span>
                    <span
                      className="text-black text-[11px] px-3 py-1 rounded-full"
                      style={{ background: ACCENT, fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                    >
                      {c.tag}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <p className="text-[14px] text-black/70 leading-[1.4] mb-4">{c.desc}</p>
                  <div className="flex gap-6">
                    {c.before !== null && (
                      <div>
                        <p className="text-[11px] text-black/40 mb-0.5">PageSpeed до</p>
                        <p
                          className="text-[22px] text-red-500"
                          style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}
                        >
                          {c.before}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] text-black/40 mb-0.5">PageSpeed после</p>
                      <p
                        className="text-[22px]"
                        style={{ color: "#3a9900", fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}
                      >
                        {c.after}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 05 ОТЛИЧИЕ ── */}
      <section className="px-4 sm:px-5 mb-16 sm:mb-24">
        <div className="max-w-[1400px] mx-auto">
          <div className="rounded-[20px] p-8 sm:p-14" style={{ background: ACCENT }}>
            <h2
              className="text-[clamp(24px,3.5vw,46px)] leading-[1.1] tracking-[-0.02em] text-black max-w-[540px] mb-4"
              style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
            >
              Ваши конкуренты выглядят одинаково
            </h2>
            <p className="text-black/70 text-[16px] sm:text-[18px] leading-[1.4] max-w-[480px] mb-8">
              Синий градиент, стоковые строители, «качественно и в срок». Это можно
              использовать.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <a
                href="#бриф"
                className="bg-black text-white px-7 py-4 rounded-full text-[16px] hover:bg-black/80 transition-colors"
                style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
              >
                Проверить
              </a>
              <p className="text-black/50 text-[13px] leading-[1.3]">
                2 минуты, без звонков и переписки
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 06 ОТЗЫВЫ ── */}
      <section className="px-4 sm:px-5 mb-16 sm:mb-24">
        <div className="max-w-[1400px] mx-auto">
          <h2
            className="text-[clamp(24px,3vw,42px)] leading-[1.1] tracking-[-0.02em] text-black mb-10"
            style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
          >
            Отзывы
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {reviews.map((r) => (
              <div key={r.name} className="bg-white rounded-[16px] p-7 border border-black/[0.06]">
                <p
                  className="text-[17px] sm:text-[19px] text-black leading-[1.5] mb-6"
                  style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                >
                  «{r.quote}»
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] text-black font-medium">{r.name}</p>
                    <p className="text-[13px] text-black/50">{r.company}</p>
                  </div>
                  <a
                    href={r.url}
                    className="text-[13px] text-black/40 underline underline-offset-2 hover:text-black transition-colors"
                  >
                    Сайт →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 07 ПРОЦЕСС ── */}
      <section className="mx-4 sm:mx-5 mb-16 sm:mb-24 rounded-[20px] bg-[#111] px-6 sm:px-12 py-14 sm:py-20">
        <div className="max-w-[1400px] mx-auto">
          <h2
            className="text-[clamp(24px,3.5vw,46px)] leading-[1.1] tracking-[-0.02em] text-white mb-14"
            style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
          >
            Как проходит работа
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
            {steps.map((step) => (
              <div
                key={step.num}
                className="border border-white/10 rounded-[14px] p-5 hover:border-white/25 transition-colors"
              >
                <span
                  className="block text-[13px] mb-3 font-bold"
                  style={{ color: ACCENT, fontFamily: "'Manrope', sans-serif" }}
                >
                  {step.num}
                </span>
                <p
                  className="text-white text-[17px] mb-1"
                  style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                >
                  {step.title}
                </p>
                <p className="text-white/40 text-[13px]">{step.time}</p>
              </div>
            ))}
          </div>
          <p className="text-white/40 text-[14px] leading-[1.5] max-w-[560px]">
            От вас — фото объектов, прайс, реквизиты. Срок идёт с момента, когда всё получено.
          </p>
        </div>
      </section>

      {/* ── 08 О НАС ── */}
      <section id="о нас" className="px-4 sm:px-5 mb-16 sm:mb-24">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h2
                className="text-[clamp(24px,3.5vw,46px)] leading-[1.1] tracking-[-0.02em] text-black mb-6"
                style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
              >
                Кто делает
              </h2>
              <p className="text-[16px] sm:text-[18px] text-black/70 leading-[1.55] max-w-[500px]">
                Dars — это я, Максим. Делаю сайты сам. Поэтому вы говорите напрямую с
                исполнителем, а не через менеджера, и получаете результат за неделю, а
                не за два месяца.
              </p>
            </div>
            <div className="bg-white rounded-[16px] p-7 border border-black/[0.06] grid grid-cols-2 gap-6">
              {[
                { num: "7+", label: "лет в нише ремонта" },
                { num: "80+", label: "сайтов запущено" },
                { num: "1", label: "человек, без менеджеров" },
                { num: "5", label: "дней средний срок" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p
                    className="text-[clamp(28px,3vw,40px)] leading-none tracking-[-0.02em] text-black"
                    style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700 }}
                  >
                    {stat.num}
                  </p>
                  <p className="text-[13px] text-black/50 mt-1 leading-tight">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 09 ПАКЕТЫ ── */}
      <section id="стоимость" className="px-4 sm:px-5 mb-16 sm:mb-24">
        <div className="max-w-[1400px] mx-auto">
          <h2
            className="text-[clamp(24px,3.5vw,46px)] leading-[1.1] tracking-[-0.02em] text-black mb-10"
            style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
          >
            Пакеты
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className={`rounded-[16px] p-6 flex flex-col ${pkg.highlight ? "bg-[#111] text-white" : "bg-white border border-black/[0.06] text-black"}`}
              >
                <p
                  className={`text-[14px] mb-1 ${pkg.highlight ? "text-white/50" : "text-black/50"}`}
                  style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                >
                  {pkg.name}
                </p>
                <p
                  className="text-[clamp(28px,2.5vw,36px)] tracking-[-0.02em] mb-6 leading-none"
                  style={{
                    color: pkg.highlight ? ACCENT : "#111",
                    fontFamily: "'Manrope', sans-serif",
                    fontWeight: 700,
                  }}
                >
                  {pkg.price}
                </p>
                <ul className="flex flex-col gap-2.5 mb-8 flex-1">
                  {pkg.items.map((item) => (
                    <li
                      key={item}
                      className={`text-[14px] flex items-start gap-2 leading-[1.3] ${pkg.highlight ? "text-white/80" : "text-black/70"}`}
                    >
                      <span style={{ color: ACCENT }} className="shrink-0 mt-0.5">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href="#бриф"
                  className="text-center py-3.5 rounded-full text-[15px] transition-colors"
                  style={{
                    background: pkg.highlight ? ACCENT : "#111",
                    color: pkg.highlight ? "#111" : "#fff",
                    fontFamily: "'Manrope', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Выбрать
                </a>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-black/40 leading-[1.5]">
            Поддержка — 3 000 ₽/мес. Предоплата 50%. Первый экран показываю на 2-й день.
            Не подойдёт направление — возвращаю предоплату полностью.
          </p>
        </div>
      </section>

      {/* ── 10 БРИФ ── */}
      <section
        id="бриф"
        className="mx-4 sm:mx-5 mb-16 sm:mb-24 rounded-[20px] bg-[#111] px-6 sm:px-12 py-14 sm:py-20"
      >
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2
              className="text-[clamp(22px,3.5vw,44px)] leading-[1.1] tracking-[-0.02em] text-white mb-4"
              style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
            >
              Заполните бриф — пришлю структуру и смету
            </h2>
            <p className="text-white/40 text-[15px] leading-[1.5]">
              20 минут, ни к чему не обязывает. Стилистику выбираете картинками.
            </p>
          </div>
          <div className="border border-white/10 rounded-[16px] p-7">
            {briefDone ? (
              <div className="text-center py-6">
                <div className="text-5xl mb-4" style={{ color: ACCENT }}>✓</div>
                <p
                  className="text-white text-[20px] mb-2"
                  style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                >
                  Отлично, спасибо!
                </p>
                <p className="text-white/50 text-[14px]">
                  Свяжусь в течение часа. В рабочее время — быстрее.
                </p>
              </div>
            ) : (
              <>
                <div className="flex gap-1.5 mb-6">
                  {briefQuestions.map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-[3px] rounded-full transition-all"
                      style={{ background: i <= briefStep ? ACCENT : "rgba(255,255,255,0.1)" }}
                    />
                  ))}
                </div>
                <p
                  className="text-white/50 text-[12px] mb-2"
                  style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                >
                  Вопрос {briefStep + 1} из {briefQuestions.length}
                </p>
                <p
                  className="text-white text-[18px] sm:text-[20px] mb-6 leading-tight"
                  style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
                >
                  {currentQ.question}
                </p>
                <div className="flex flex-col gap-3">
                  {currentQ.options.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleBriefAnswer(option)}
                      className="text-left px-5 py-3.5 rounded-[10px] border border-white/10 text-white text-[15px] hover:border-white/40 hover:bg-white/[0.05] transition-all"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 11 ФУТЕР ── */}
      <footer className="px-4 sm:px-5 pb-10">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p
            className="text-[18px] text-black"
            style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500 }}
          >
            Dars studio
          </p>
          <div className="flex items-center gap-6">
            {[
              { label: "Telegram", href: "https://t.me/" },
              { label: "WhatsApp", href: "https://wa.me/" },
              { label: "Почта", href: "mailto:hello@darsstudio.ru" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-[14px] text-black/50 hover:text-black transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
          <p className="text-[13px] text-black/30">© {new Date().getFullYear()} Dars studio</p>
        </div>
      </footer>
    </div>
  );
}
