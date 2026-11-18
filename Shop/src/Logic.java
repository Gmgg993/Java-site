import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Правила магазина TechParts. Здесь собраны все условия:
 * if-else, if-else if, &&, ||, !, вложенные if и switch.
 */
public final class Logic {
    private Logic() {
    }

    static final String[][] CATEGORIES = {
            {"cpu", "Процессоры", "pc"}, {"gpu", "Видеокарты", "pc"}, {"mem", "Память и SSD", "pc"},
            {"board", "Материнские платы", "pc"}, {"phone", "Смартфоны", "phone"},
            {"acc", "Аксессуары", "phone"}, {"parts", "Запчасти", "phone"}};

    static String categoryName(String id) {
        for (String[] c : CATEGORIES) {
            if (c[0].equals(id)) {
                return c[1];
            }
        }
        return id;
    }

    static boolean validCategory(String id) {
        for (String[] c : CATEGORIES) {
            if (c[0].equals(id)) {
                return true;
            }
        }
        return false;
    }

    static String money(double v) {
        return String.format(Locale.US, "%,.0f", v).replace(',', ' ') + " ₸";
    }

    static String pct(double p) {
        return (p == Math.floor(p) ? String.valueOf((long) p) : String.valueOf(p)) + "%";
    }

    /** Ответ инструмента: цвет, заголовок и строки пояснений. */
    static final class Out {
        final String level;
        final String headline;
        final List<Object> lines = new ArrayList<>();

        Out(String level, String headline) {
            this.level = level;
            this.headline = headline;
        }

        Out line(String s) {
            lines.add(s);
            return this;
        }

        Map<String, Object> map() {
            return M.map("level", level, "headline", headline, "lines", lines);
        }
    }

    // ================= статусы =================

    /** Статус пользователя: активный / неактивный / заблокированный (if-else). */
    static String userStatus(Map<String, Object> u) {
        if (M.b(u, "blocked")) {
            return "blocked";
        }
        long days = (System.currentTimeMillis() - M.l(u, "lastSeen")) / 86400000L;
        if (days > 30) {
            return "inactive";
        }
        return "active";
    }

    static String statusText(String status) {
        switch (status) {
            case "blocked":
                return "Заблокирован";
            case "inactive":
                return "Неактивный";
            default:
                return "Активный";
        }
    }

    /** Остаток товара: три результата плюс «нет в наличии». */
    static Map<String, Object> stockInfo(long stock) {
        if (stock <= 0) {
            return M.map("level", "out", "label", "Нет в наличии");
        } else if (stock <= 5) {
            return M.map("level", "low", "label", "Осталось " + stock + " шт.");
        } else if (stock <= 20) {
            return M.map("level", "ok", "label", "В наличии");
        } else {
            return M.map("level", "high", "label", "Много на складе");
        }
    }

    /** Возраст по дате рождения; -1, если дата не указана. */
    static int age(String birth) {
        if (birth == null || birth.isEmpty()) {
            return -1;
        }
        try {
            return Period.between(LocalDate.parse(birth), LocalDate.now()).getYears();
        } catch (Exception e) {
            return -1;
        }
    }

    /** Возрастные категории (if-else if). */
    static String ageGroup(int age) {
        if (age < 0) {
            return "unknown";
        } else if (age < 14) {
            return "child";
        } else if (age < 18) {
            return "teen";
        } else if (age < 60) {
            return "adult";
        } else {
            return "senior";
        }
    }

    // ================= лояльность и анализ клиента =================

    private static double[] yearStats(List<Map<String, Object>> orders) {
        long yearAgo = System.currentTimeMillis() - 365L * 86400000L;
        double count = 0;
        double sum = 0;
        double returns = 0;
        for (Map<String, Object> o : orders) {
            String st = M.s(o, "status");
            if (st.equals("returned")) {
                returns++;
            }
            if (st.equals("cancelled") || st.equals("returned")) {
                continue;
            }
            if (M.l(o, "created") >= yearAgo) {
                count++;
                sum += M.d(o, "total");
            }
        }
        return new double[]{count, sum, returns};
    }

    /** Статус клиента для скидки: new / regular / vip. Условие VIP — через ||. */
    static String loyaltyStatus(Map<String, Object> user, List<Map<String, Object>> orders, List<String> reasons) {
        double[] st = yearStats(orders);
        boolean partner = user != null && M.b(user, "partner");
        if (st[1] >= 500000 || st[0] >= 10 || partner) {
            if (reasons != null) {
                if (st[1] >= 500000) {
                    reasons.add("покупки за год от 500 000 ₸");
                }
                if (st[0] >= 10) {
                    reasons.add("10 и больше заказов за год");
                }
                if (partner) {
                    reasons.add("партнёрская карта");
                }
            }
            return "vip";
        } else if (st[0] >= 3 || st[1] >= 100000) {
            return "regular";
        }
        return "new";
    }

    static String loyaltyText(String s) {
        switch (s) {
            case "vip":
                return "VIP-клиент";
            case "regular":
                return "Постоянный клиент";
            default:
                return "Новый клиент";
        }
    }

    /** Анализ клиента: пять параметров → три уровня и персональные рекомендации. */
    static Map<String, Object> analysis(Map<String, Object> user, List<Map<String, Object>> orders) {
        double[] st = yearStats(orders);
        int count = (int) st[0];
        double avg = count > 0 ? st[1] / count : 0;
        int returns = (int) st[2];
        boolean profile = !M.s(user, "birth").isEmpty() && !M.s(user, "phone").isEmpty() && M.d(user, "income") > 0;
        long months = (System.currentTimeMillis() - M.l(user, "created")) / (30L * 86400000L);

        int score = 0;
        List<Object> parts = new ArrayList<>();

        int s1;
        if (count >= 12) s1 = 3;
        else if (count >= 5) s1 = 2;
        else if (count >= 1) s1 = 1;
        else s1 = 0;
        score += s1;
        parts.add(M.map("name", "Заказы за год", "points", s1, "note", count + " шт."));

        int s2;
        if (avg >= 200000) s2 = 3;
        else if (avg >= 80000) s2 = 2;
        else if (avg >= 20000) s2 = 1;
        else s2 = 0;
        score += s2;
        parts.add(M.map("name", "Средний чек", "points", s2, "note", money(avg)));

        int s3;
        if (count == 0 && returns == 0) s3 = 0;
        else if (returns == 0) s3 = 2;
        else if (returns <= 2) s3 = 1;
        else s3 = -1;
        score += s3;
        parts.add(M.map("name", "Возвраты", "points", s3, "note", returns + " шт."));

        int s4 = profile ? 1 : 0;
        score += s4;
        parts.add(M.map("name", "Заполненный профиль", "points", s4, "note", profile ? "да" : "нет"));

        int s5;
        if (months >= 24) s5 = 2;
        else if (months >= 6) s5 = 1;
        else s5 = 0;
        score += s5;
        parts.add(M.map("name", "Срок с нами", "points", s5, "note", months + " мес."));

        String level;
        String levelText;
        if (score >= 8) {
            level = "high";
            levelText = "Высокий уровень";
        } else if (score >= 4) {
            level = "medium";
            levelText = "Средний уровень";
        } else {
            level = "low";
            levelText = "Начальный уровень";
        }

        List<Object> recs = new ArrayList<>();
        if (!profile) {
            recs.add("Заполните профиль (дата рождения, телефон, доход): так откроются рассрочка и личные предложения.");
        }
        if (level.equals("high") && returns <= 2) {
            recs.add("Вам доступна скидка VIP: до 10% на заказы и приоритетная поддержка.");
        } else if (level.equals("high")) {
            recs.add("Уровень высокий, но возвратов много: перед покупкой обращайтесь за консультацией, мы поможем с выбором.");
        }
        if (level.equals("medium") && avg < 80000) {
            recs.add("Соберите комплект (процессор + память): так выгоднее, а средний чек и скидка вырастут.");
        }
        if (level.equals("medium") && count < 5) {
            recs.add("Ещё несколько заказов — и откроется статус постоянного клиента с повышенной скидкой.");
        }
        if (level.equals("low") && months < 6) {
            recs.add("Вы у нас недавно. Начните с аксессуаров или услуги диагностики и копите скидку.");
        }
        if (level.equals("low") && returns > 2) {
            recs.add("Возвратов много: воспользуйтесь подбором техники, чтобы покупка подошла с первого раза.");
        }
        if (months >= 24 && count == 0) {
            recs.add("Давно не заказывали: загляните в каталог, цены и наличие обновились.");
        }
        if (recs.isEmpty()) {
            recs.add("Всё хорошо. Следите за акцией дня на главной странице.");
        }

        return M.map("score", score, "level", level, "levelText", levelText, "parts", parts, "recs", recs,
                "stats", M.map("orders", count, "sum", st[1], "avg", avg, "returns", returns, "months", months));
    }

    // ================= рассрочка и финансы =================

    /** Рассрочка доступна, если возраст от 18 лет И доход от 100 000 ₸ И аккаунт не заблокирован. */
    static Map<String, Object> installment(int age, double income, boolean blocked, double total) {
        boolean ok = age >= 18 && income >= 100000 && !blocked;
        String reason;
        double monthly = Math.round(total / 12);
        if (ok && monthly > income * 0.4) {
            ok = false;
            reason = "Платёж " + money(monthly) + " в месяц больше 40% вашего дохода.";
        } else if (ok) {
            reason = "Рассрочка на 12 месяцев: " + money(monthly) + " в месяц.";
        } else if (blocked) {
            reason = "Аккаунт заблокирован.";
        } else if (age < 0 || income <= 0) {
            reason = "Укажите дату рождения и доход в личном кабинете, чтобы проверить рассрочку.";
        } else if (age < 18) {
            reason = "Рассрочка доступна с 18 лет.";
        } else {
            reason = "Для рассрочки нужен доход от 100 000 ₸ в месяц.";
        }
        return M.map("available", ok, "reason", reason, "monthly", monthly);
    }

    // ================= скидки, акция дня =================

    static double baseDiscount(double sum) {
        if (sum >= 300000) {
            return 8;
        } else if (sum >= 150000) {
            return 5;
        } else if (sum >= 50000) {
            return 3;
        }
        return 0;
    }

    static double statusBonus(String status) {
        if (status.equals("vip")) {
            return 5;
        } else if (status.equals("regular")) {
            return 2;
        }
        return 0;
    }

    /** Акция дня зависит от дня недели (switch). */
    static Map<String, Object> dayPromo() {
        int dow = LocalDate.now(ZoneId.of("Asia/Almaty")).getDayOfWeek().getValue();
        String cat = "";
        int percent = 0;
        String title;
        String text;
        switch (dow) {
            case 1:
                cat = "acc";
                percent = 5;
                title = "Понедельник: −5% на аксессуары";
                text = "Стёкла, чехлы и зарядки для телефонов дешевле на 5%.";
                break;
            case 3:
                title = "Среда: бесплатная чистка ПК";
                text = "Купите любые комплектующие — и мы бесплатно почистим ваш компьютер от пыли.";
                break;
            case 5:
                cat = "mem";
                percent = 7;
                title = "Пятница: −7% на память и накопители";
                text = "Оперативная память, SSD и жёсткие диски со скидкой 7%.";
                break;
            default:
                title = "Скидка зависит от вашего статуса";
                text = "Чем больше заказов, тем выше скидка: до 20% на всю покупку.";
                break;
        }
        boolean weekend = dow == 6 || dow == 7;
        return M.map("title", title, "text", text, "cat", cat, "percent", percent, "weekend", weekend);
    }

    // ================= доставка и оплата =================

    /** Доставка: несколько вложенных проверок и switch по городу. */
    static Map<String, Object> delivery(String method, String city, double weight, double goodsTotal) {
        double cost;
        String note;
        if (method.equals("pickup")) {
            cost = 0;
            note = "Самовывоз из магазина — бесплатно.";
        } else if (method.equals("courier")) {
            boolean inCity = city.equals("astana") || city.equals("almaty");
            if (inCity) {
                if (goodsTotal >= 30000) {
                    cost = 0;
                    note = "Курьер по городу — бесплатно (заказ от 30 000 ₸).";
                } else {
                    switch (city) {
                        case "astana":
                            cost = 1000;
                            break;
                        default:
                            cost = 1500;
                            break;
                    }
                    note = "Курьер по городу. Бесплатно при заказе от 30 000 ₸.";
                }
            } else {
                cost = 3000;
                if (weight > 5) {
                    cost += (weight - 5) * 300;
                }
                note = "Доставка в другой регион транспортной компанией, 3–5 дней.";
            }
        } else {
            throw new ApiError(400, "Выберите способ получения: самовывоз или курьер.");
        }
        return M.map("cost", Math.round(cost), "note", note);
    }

    static String cityName(String city) {
        switch (city) {
            case "astana":
                return "Астана";
            case "almaty":
                return "Алматы";
            default:
                return "Другой регион";
        }
    }

    /** Способ оплаты (switch). Неверный выбор — понятное сообщение. */
    static String paymentName(String payment, String method, String city) {
        switch (payment) {
            case "card":
                return "Банковская карта";
            case "cash":
                if (method.equals("pickup") || city.equals("astana") || city.equals("almaty")) {
                    return "Наличные при получении";
                }
                throw new ApiError(400, "Наличными можно платить только при самовывозе или курьеру по городу. Выберите другой способ оплаты.");
            case "installment":
                return "Рассрочка на 12 месяцев";
            case "wallet":
                return "Онлайн-кошелёк";
            default:
                throw new ApiError(400, "Способа оплаты \"" + payment + "\" не существует. Выберите способ из списка и повторите.");
        }
    }

    /** Риск заказа по нескольким параметрам. */
    static Map<String, Object> risk(double sum, boolean firstOrder, int ordersLastHour, int maxSameItem) {
        int score = 0;
        List<Object> reasons = new ArrayList<>();
        if (sum >= 300000) {
            score += 3;
            reasons.add("крупная сумма");
        } else if (sum >= 100000) {
            score += 1;
            reasons.add("сумма выше средней");
        }
        if (firstOrder) {
            score += 2;
            reasons.add("первый заказ");
        }
        if (ordersLastHour >= 3) {
            score += 3;
            reasons.add("частые заказы за последний час");
        }
        if (maxSameItem >= 3) {
            score += 2;
            reasons.add("много одинаковых товаров");
        }
        String level;
        if (score >= 6) {
            level = "high";
        } else if (score >= 3) {
            level = "medium";
        } else {
            level = "low";
        }
        return M.map("score", score, "level", level, "reasons", reasons);
    }

    // ================= услуги и инструменты =================

    /** Категории услуг: у каждой свои возможности (switch). */
    static List<Object> services() {
        List<Object> list = new ArrayList<>();
        for (String id : new String[]{"build", "repair", "clean", "upgrade"}) {
            String name;
            String from;
            List<String> features;
            switch (id) {
                case "build":
                    name = "Сборка ПК";
                    from = "от 15 000 ₸";
                    features = Arrays.asList("Подбор совместимых деталей", "Сборка и аккуратная прокладка кабелей", "Тест под нагрузкой 24 часа");
                    break;
                case "repair":
                    name = "Ремонт телефона";
                    from = "от 5 000 ₸";
                    features = Arrays.asList("Замена экрана и аккумулятора", "Ремонт разъёма зарядки", "Влагозащита после ремонта");
                    break;
                case "clean":
                    name = "Диагностика и чистка";
                    from = "от 5 000 ₸";
                    features = Arrays.asList("Проверка температур", "Замена термопасты", "Чистка от пыли");
                    break;
                default:
                    name = "Апгрейд компьютера";
                    from = "от 5 000 ₸";
                    features = Arrays.asList("Добавление оперативной памяти", "Замена накопителя на SSD", "Установка новой видеокарты");
                    break;
            }
            list.add(M.map("id", id, "name", name, "from", from, "features", new ArrayList<Object>(features)));
        }
        return list;
    }

    /** Калькулятор стоимости услуги: тариф и дополнительные параметры. */
    static Map<String, Object> serviceCalc(Params p) {
        String tariff = p.str("tariff", "Тариф");
        int devices = p.integer("devices", "Количество устройств", 1, 10);
        boolean urgent = p.yes("urgent", "Срочное выполнение");
        boolean visit = p.yes("visit", "Выезд мастера");
        boolean ext = p.yes("ext", "Расширенная гарантия");
        double price;
        String name;
        switch (tariff) {
            case "basic":
                price = 5000;
                name = "Базовый";
                break;
            case "standard":
                price = 10000;
                name = "Стандарт";
                break;
            case "premium":
                price = 20000;
                name = "Премиум";
                break;
            default:
                throw new ApiError(400, "Тарифа \"" + tariff + "\" не существует. Выберите тариф из списка.");
        }
        Out r = new Out("good", "");
        price = price * devices;
        r.line("Тариф «" + name + "» × " + devices + " = " + money(price));
        if (urgent) {
            price = price * 1.3;
            r.line("Срочно: +30%");
        }
        if (visit) {
            price = price + 5000;
            r.line("Выезд мастера: +" + money(5000));
        }
        if (ext) {
            price = price * 1.1;
            r.line("Гарантия 12 месяцев: +10%");
        }
        Out done = new Out("good", "Итого: " + money(price));
        done.lines.addAll(r.lines);
        return done.map();
    }

    /** Трейд-ин: оценка старого устройства. */
    static Map<String, Object> tradeIn(Params p) {
        String device = p.str("device", "Устройство");
        int age = p.integer("age", "Возраст устройства", 0, 15);
        String cond = p.str("cond", "Состояние");
        double value;
        switch (device) {
            case "phone":
                value = 100000;
                break;
            case "gpu":
                value = 120000;
                break;
            case "cpu":
                value = 60000;
                break;
            default:
                throw new ApiError(400, "Тип устройства \"" + device + "\" не поддерживается.");
        }
        if (age >= 5) {
            value *= 0.2;
        } else if (age >= 3) {
            value *= 0.5;
        } else {
            value *= 0.8;
        }
        if (cond.equals("bad") || age > 8) {
            value *= 0.5;
        } else if (cond.equals("excellent") && age <= 2) {
            value *= 1.1;
        }
        return new Out("info", "Оценка: " + money(Math.round(value / 100) * 100))
                .line("Эту сумму мы засчитаем при покупке нового устройства.")
                .line("Точную цену назовёт мастер после осмотра.").map();
    }

    /** Гарантийный случай: отрицание, && и if-else. */
    static Map<String, Object> warranty(Params p) {
        int months = p.integer("months", "Месяцев с покупки", 0, 60);
        boolean receipt = p.yes("receipt", "Есть чек или талон");
        boolean damaged = p.yes("damaged", "Следы падения или жидкости");
        if (!damaged && receipt && months <= 12) {
            return new Out("good", "Бесплатный гарантийный ремонт").line("Принесите устройство и чек в магазин.").map();
        } else if (!damaged && receipt && months <= 24) {
            return new Out("warn", "Расширенная гарантия").line("Запчасти бесплатно, работа — 50% стоимости.").map();
        }
        return new Out("bad", "Платный ремонт")
                .line("Гарантия не действует: нет чека, срок истёк или есть следы повреждений.").map();
    }

    /** Возврат товара: switch + || + !. */
    static Map<String, Object> returnCheck(Params p) {
        String reason = p.str("reason", "Причина возврата");
        int days = p.integer("days", "Дней с покупки", 0, 365);
        boolean used = p.yes("used", "Товар использовался");
        switch (reason) {
            case "unfit":
                if (days <= 14 && !used) {
                    return new Out("good", "Возврат денег полностью").line("Товар не использовался и срок не вышел.").map();
                }
                return new Out("bad", "Возврат невозможен")
                        .line("Нужно уложиться в 14 дней, и товар не должен быть в употреблении.").map();
            case "defect":
                if (days <= 30 || !used) {
                    return new Out("good", "Возврат денег или обмен на исправный товар").map();
                }
                return new Out("warn", "Нужна экспертиза в сервисном центре")
                        .line("Мы проверим товар и сообщим решение.").map();
            default:
                throw new ApiError(400, "Причины \"" + reason + "\" нет в списке. Выберите причину возврата.");
        }
    }

    /** Финансовое состояние: доходы и расходы. */
    static Map<String, Object> finance(Params p) {
        double income = p.number("income", "Доход в месяц", 1, 1000000000);
        double expenses = p.number("expenses", "Расходы в месяц", 0, 1000000000);
        double price = p.number("price", "Цена покупки", 0, 1000000000);
        double monthly = Math.round(price / 12);
        if (expenses > income) {
            return new Out("bad", "Дефицит бюджета").line("Расходы больше доходов: крупную покупку лучше отложить.").map();
        }
        double ratio = expenses / income * 100;
        Out r;
        if (ratio <= 50) {
            r = new Out("good", "Отличное состояние").line("Можно покупать технику без кредита.");
        } else if (ratio <= 80) {
            r = new Out("warn", "Стабильное состояние").line("Подойдёт покупка в рассрочку.");
        } else {
            r = new Out("warn", "Напряжённое состояние").line("Выбирайте недорогие комплектующие.");
        }
        r.line("Расходы составляют " + Math.round(ratio) + "% дохода.");
        if (price > 0) {
            boolean fits = expenses + monthly <= income * 0.9;
            r.line("Платёж по рассрочке на 12 месяцев: " + money(monthly) + (fits ? " — вписывается в бюджет." : " — слишком много для вашего бюджета."));
        }
        return r.map();
    }

    /** Оценка обслуживания: баллы → оценка. */
    static Map<String, Object> grade(int points) {
        String mark;
        if (points >= 85) {
            mark = "5 (отлично)";
        } else if (points >= 70) {
            mark = "4 (хорошо)";
        } else if (points >= 50) {
            mark = "3 (удовлетворительно)";
        } else {
            mark = "2 (неудовлетворительно)";
        }
        return M.map("mark", mark, "passed", points >= 50);
    }

    /** Подбор техники: цель и бюджет → рекомендация и подходящие разделы каталога. */
    static Map<String, Object> advise(int goal, double budget) {
        String advice;
        List<Object> cats = new ArrayList<>();
        if (goal == 1) {
            cats.add("gpu");
            cats.add("cpu");
            if (budget >= 600000) {
                advice = "Игровой ПК: Core i7 / Ryzen 7, видеокарта верхнего уровня, 32 ГБ ОЗУ.";
            } else if (budget >= 300000) {
                advice = "Игровой ПК среднего уровня: Ryzen 5 / Core i5, видеокарта среднего уровня, 16 ГБ ОЗУ.";
            } else {
                advice = "Бюджетная сборка: процессор со встроенной графикой, недорогая видеокарта, 16 ГБ ОЗУ.";
            }
        } else if (goal == 2) {
            cats.add("cpu");
            cats.add("mem");
            if (budget >= 400000) {
                advice = "Рабочая станция: многоядерный процессор, 32 ГБ ОЗУ, быстрый NVMe-накопитель.";
            } else {
                advice = "Универсальный ПК: 6-ядерный процессор, 16 ГБ ОЗУ, SSD 512 ГБ.";
            }
        } else if (goal == 3) {
            cats.add("cpu");
            cats.add("mem");
            advice = "Офисный ПК: процессор начального уровня, 8–16 ГБ ОЗУ, SSD 256–512 ГБ.";
        } else {
            cats.add("phone");
            cats.add("acc");
            if (budget >= 400000) {
                advice = "Флагманский смартфон с хорошей камерой и 256 ГБ памяти.";
            } else if (budget >= 150000) {
                advice = "Смартфон среднего класса с 8 ГБ ОЗУ.";
            } else {
                advice = "Бюджетный смартфон; добавьте защитное стекло и чехол.";
            }
        }
        return M.map("advice", advice, "cats", cats);
    }
}
