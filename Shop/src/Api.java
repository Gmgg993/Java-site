import com.sun.net.httpserver.HttpExchange;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Запросы сайта: вход, каталог, статьи, реклама, корзина, заказы и личный кабинет. */
public final class Api {
    private Api() {
    }

    static final Object LOCK = new Object();
    static final Map<String, Long> sessions = new HashMap<>();
    static final Map<String, long[]> fails = new HashMap<>();

    static final String[] ORDER_STATUSES = {"new", "call", "review", "shipped", "done", "cancelled", "returned"};

    static final class Req {
        HttpExchange ex;
        String method;
        String path;
        final Map<String, String> q = new HashMap<>();
        Map<String, Object> body = new LinkedHashMap<>();
        Map<String, Object> user;
        Matcher m;

        boolean is(String meth, String regex) {
            if (!method.equals(meth)) {
                return false;
            }
            m = Pattern.compile(regex).matcher(path);
            return m.matches();
        }

        long id() {
            return Long.parseLong(m.group(1));
        }
    }

    // ================= приём запроса =================

    static void handle(HttpExchange ex) throws IOException {
        int code = 200;
        String json;
        try {
            Req r = new Req();
            r.ex = ex;
            r.method = ex.getRequestMethod();
            r.path = ex.getRequestURI().getPath();
            String qs = ex.getRequestURI().getRawQuery();
            if (qs != null && !qs.isEmpty()) {
                for (String pair : qs.split("&")) {
                    int i = pair.indexOf('=');
                    String k = URLDecoder.decode(i < 0 ? pair : pair.substring(0, i), "UTF-8");
                    String v = i < 0 ? "" : URLDecoder.decode(pair.substring(i + 1), "UTF-8");
                    r.q.put(k, v);
                }
            }
            boolean writes = !r.method.equals("GET") && !r.method.equals("HEAD");
            if (writes && !"tp".equals(ex.getRequestHeaders().getFirst("X-Requested-With"))) {
                throw new ApiError(403, "Запрос отклонён.");
            }
            Object res;
            if (r.is("POST", "/api/admin/upload")) {
                res = Admin.upload(r);
            } else {
                if (writes) {
                    byte[] raw = readAll(ex.getRequestBody(), 3 * 1024 * 1024);
                    if (raw.length > 0) {
                        Object parsed = Json.parse(new String(raw, StandardCharsets.UTF_8));
                        r.body = M.asMap(parsed);
                    }
                }
                synchronized (LOCK) {
                    r.user = currentUser(r);
                    res = route(r);
                }
            }
            json = Json.write(res);
        } catch (ApiError e) {
            code = e.status;
            json = Json.write(M.map("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            code = 400;
            json = Json.write(M.map("error", "Некорректные данные запроса."));
        } catch (Exception e) {
            code = 500;
            e.printStackTrace();
            json = Json.write(M.map("error", "Внутренняя ошибка сервера. Попробуйте ещё раз."));
        }
        byte[] out = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(code, out.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(out);
        }
    }

    static byte[] readAll(InputStream in, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > limit) {
                throw new ApiError(413, "Слишком большой запрос.");
            }
        }
        return out.toByteArray();
    }

    // ================= сессии =================

    static Map<String, Object> currentUser(Req r) {
        String cookies = r.ex.getRequestHeaders().getFirst("Cookie");
        if (cookies == null) {
            return null;
        }
        for (String part : cookies.split(";")) {
            String c = part.trim();
            if (c.startsWith("sid=")) {
                Long id = sessions.get(c.substring(4));
                if (id == null) {
                    return null;
                }
                Map<String, Object> u = Db.users.find(id);
                if (u != null && System.currentTimeMillis() - M.l(u, "lastSeen") > 300000) {
                    u.put("lastSeen", System.currentTimeMillis());
                    Db.users.save();
                }
                return u;
            }
        }
        return null;
    }

    static Map<String, Object> requireUser(Req r) {
        if (r.user == null) {
            throw new ApiError(401, "Войдите в аккаунт, чтобы продолжить.");
        }
        return r.user;
    }

    static void startSession(Req r, Map<String, Object> u) {
        String sid = Auth.randomToken(24);
        sessions.put(sid, M.l(u, "id"));
        u.put("lastSeen", System.currentTimeMillis());
        Db.users.save();
        r.ex.getResponseHeaders().add("Set-Cookie", "sid=" + sid + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800");
    }

    // ================= маршруты =================

    static Object route(Req r) {
        if (r.is("GET", "/api/me")) return me(r);
        if (r.is("POST", "/api/register")) return register(r);
        if (r.is("POST", "/api/login")) return login(r);
        if (r.is("POST", "/api/logout")) return logout(r);
        if (r.is("GET", "/api/config")) return config();
        if (r.is("GET", "/api/ads")) return ads();
        if (r.is("POST", "/api/ads/(\\d+)/(view|click)")) return adEvent(r);
        if (r.is("GET", "/api/home")) return home();
        if (r.is("GET", "/api/products")) return products(r);
        if (r.is("GET", "/api/products/(\\d+)")) return product(r.id());
        if (r.is("GET", "/api/posts")) return posts(r);
        if (r.is("GET", "/api/posts/(\\d+)")) return post(r.id());
        if (r.is("GET", "/api/services")) return Logic.services();
        if (r.is("POST", "/api/tools/([a-z]+)")) return tool(r);
        if (r.is("POST", "/api/quote")) return quoteApi(r);

        if (r.path.startsWith("/api/admin/")) {
            return Admin.route(r);
        }

        if (r.is("GET", "/api/profile")) return userView(requireUser(r));
        if (r.is("PUT", "/api/profile")) return saveProfile(r);
        if (r.is("POST", "/api/password")) return changePassword(r);
        if (r.is("GET", "/api/cabinet")) return cabinet(r);
        if (r.is("GET", "/api/orders")) return myOrders(r);
        if (r.is("POST", "/api/orders/(\\d+)/rate")) return rateOrder(r);
        if (r.is("POST", "/api/checkout")) return checkout(r);
        throw new ApiError(404, "Страница не найдена.");
    }

    // ================= аккаунт =================

    static Map<String, Object> userView(Map<String, Object> u) {
        String status = Logic.userStatus(u);
        return M.map("id", u.get("id"), "login", u.get("login"), "name", u.get("name"), "role", u.get("role"),
                "email", M.s(u, "email"), "phone", M.s(u, "phone"), "birth", M.s(u, "birth"),
                "income", M.d(u, "income"), "city", M.s(u, "city"), "address", M.s(u, "address"),
                "status", status, "statusText", Logic.statusText(status), "created", u.get("created"));
    }

    static Object me(Req r) {
        return M.map("user", r.user == null ? null : userView(r.user));
    }

    static Object config() {
        List<Object> cats = new ArrayList<>();
        for (String[] c : Logic.CATEGORIES) {
            cats.add(M.map("id", c[0], "name", c[1], "group", c[2]));
        }
        return M.map("categories", cats, "promo", Logic.dayPromo(),
                "postCategories", M.list("Новости", "Обзоры", "Гайды", "Акции"));
    }

    static Object register(Req r) {
        Params p = new Params(r.body);
        String login = p.str("login", "Логин");
        String name = p.str("name", "Имя");
        String password = M.s(r.body, "password");
        if (!login.matches("[A-Za-z0-9_.@-]{3,40}")) {
            throw new ApiError(400, "Логин: от 3 до 40 символов, только латиница, цифры и знаки _ . @ -");
        }
        if (name.length() > 60) {
            throw new ApiError(400, "Имя слишком длинное: не более 60 символов.");
        }
        if (password.length() < 6) {
            throw new ApiError(400, "Пароль должен быть не короче 6 символов.");
        }
        for (Map<String, Object> u : Db.users.all()) {
            if (M.s(u, "login").equalsIgnoreCase(login)) {
                throw new ApiError(409, "Такой логин уже занят. Придумайте другой.");
            }
        }
        long now = System.currentTimeMillis();
        String salt = Auth.randomToken(8);
        Map<String, Object> u = Db.users.insert(M.map(
                "login", login, "name", name, "role", "user", "salt", salt, "passHash", Auth.hash(password, salt),
                "blocked", false, "partner", false, "email", login.contains("@") ? login : "", "phone", "",
                "birth", "", "income", 0, "city", "", "address", "", "created", now, "lastSeen", now));
        Db.event("Новый пользователь: " + login);
        startSession(r, u);
        return M.map("user", userView(u));
    }

    static Object login(Req r) {
        Params p = new Params(r.body);
        String login = p.str("login", "Логин");
        String password = p.str("password", "Пароль");
        String key = login.toLowerCase(Locale.ROOT);
        long now = System.currentTimeMillis();
        long[] f = fails.computeIfAbsent(key, k -> new long[2]);
        if (now < f[1]) {
            throw new ApiError(429, "Попытки исчерпаны. Подождите " + ((f[1] - now + 999) / 1000) + " сек. и повторите вход.");
        }
        Map<String, Object> found = null;
        for (Map<String, Object> u : Db.users.all()) {
            if (M.s(u, "login").equalsIgnoreCase(login)) {
                found = u;
                break;
            }
        }
        if (found == null || !Auth.check(password, M.s(found, "salt"), M.s(found, "passHash"))) {
            f[0]++;
            if (f[0] >= 3) {
                f[0] = 0;
                f[1] = now + 15000;
                throw new ApiError(401, "Неверный логин или пароль. Попытки исчерпаны, вход закрыт на 15 секунд.");
            }
            throw new ApiError(401, "Неверный логин или пароль. Осталось попыток: " + (3 - f[0]) + ".");
        }
        f[0] = 0;
        startSession(r, found);
        return M.map("user", userView(found));
    }

    static Object logout(Req r) {
        String cookies = r.ex.getRequestHeaders().getFirst("Cookie");
        if (cookies != null) {
            for (String part : cookies.split(";")) {
                String c = part.trim();
                if (c.startsWith("sid=")) {
                    sessions.remove(c.substring(4));
                }
            }
        }
        r.ex.getResponseHeaders().add("Set-Cookie", "sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
        return M.map("ok", true);
    }

    static Object saveProfile(Req r) {
        Map<String, Object> u = requireUser(r);
        Map<String, Object> b = r.body;
        String name = M.s(b, "name");
        if (name.isEmpty() || name.length() > 60) {
            throw new ApiError(400, "Имя обязательно, не более 60 символов.");
        }
        String email = M.s(b, "email");
        if (!email.isEmpty() && !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) {
            throw new ApiError(400, "Электронная почта указана неверно. Пример: name@mail.kz");
        }
        String phone = M.s(b, "phone");
        if (!phone.isEmpty() && phone.replaceAll("\\D", "").length() < 10) {
            throw new ApiError(400, "Телефон: не меньше 10 цифр.");
        }
        String birth = M.s(b, "birth");
        if (!birth.isEmpty()) {
            try {
                LocalDate d = LocalDate.parse(birth);
                int age = Logic.age(birth);
                if (d.isAfter(LocalDate.now()) || age > 120) {
                    throw new ApiError(400, "Проверьте дату рождения.");
                }
            } catch (java.time.format.DateTimeParseException e) {
                throw new ApiError(400, "Дата рождения указана неверно.");
            }
        }
        double income = 0;
        if (!M.s(b, "income").isEmpty()) {
            income = new Params(b).number("income", "Доход в месяц", 0, 1000000000);
        }
        String city = M.s(b, "city");
        if (!city.isEmpty() && !city.equals("astana") && !city.equals("almaty") && !city.equals("other")) {
            throw new ApiError(400, "Выберите город из списка.");
        }
        String address = M.s(b, "address");
        if (address.length() > 200) {
            throw new ApiError(400, "Адрес слишком длинный.");
        }
        u.put("name", name);
        u.put("email", email);
        u.put("phone", phone);
        u.put("birth", birth);
        u.put("income", income);
        u.put("city", city);
        u.put("address", address);
        Db.users.save();
        return userView(u);
    }

    static Object changePassword(Req r) {
        Map<String, Object> u = requireUser(r);
        String oldPw = M.s(r.body, "old");
        String newPw = M.s(r.body, "new");
        if (!Auth.check(oldPw, M.s(u, "salt"), M.s(u, "passHash"))) {
            throw new ApiError(400, "Текущий пароль указан неверно.");
        }
        if (newPw.length() < 6) {
            throw new ApiError(400, "Новый пароль должен быть не короче 6 символов.");
        }
        String salt = Auth.randomToken(8);
        u.put("salt", salt);
        u.put("passHash", Auth.hash(newPw, salt));
        Db.users.save();
        return M.map("ok", true);
    }

    static List<Map<String, Object>> ordersOf(Map<String, Object> user) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (user == null) {
            return list;
        }
        for (Map<String, Object> o : Db.orders.all()) {
            if (M.l(o, "userId") == M.l(user, "id")) {
                list.add(o);
            }
        }
        return list;
    }

    static Object cabinet(Req r) {
        Map<String, Object> u = requireUser(r);
        List<Map<String, Object>> orders = ordersOf(u);
        List<String> reasons = new ArrayList<>();
        String loyal = Logic.loyaltyStatus(u, orders, reasons);
        Map<String, Object> analysis = Logic.analysis(u, orders);
        int age = Logic.age(M.s(u, "birth"));
        return M.map("user", userView(u), "loyalty", M.map("status", loyal, "text", Logic.loyaltyText(loyal), "reasons", reasons),
                "analysis", analysis, "ageGroup", Logic.ageGroup(age),
                "installment", Logic.installment(age, M.d(u, "income"), M.b(u, "blocked"), 0));
    }

    // ================= витрина =================

    static Map<String, Object> productView(Map<String, Object> p) {
        long stock = M.l(p, "stock");
        return M.map("id", p.get("id"), "name", p.get("name"), "cat", p.get("cat"),
                "catName", Logic.categoryName(M.s(p, "cat")), "brand", M.s(p, "brand"),
                "price", M.d(p, "price"), "oldPrice", M.d(p, "oldPrice"), "stock", stock,
                "stockInfo", Logic.stockInfo(stock), "weight", M.d(p, "weight"), "image", M.s(p, "image"),
                "desc", M.s(p, "desc"), "specs", p.get("specs") == null ? new ArrayList<>() : p.get("specs"),
                "featured", M.b(p, "featured"));
    }

    static Object home() {
        List<Object> featured = new ArrayList<>();
        for (Map<String, Object> p : Db.products.all()) {
            if (M.b(p, "featured") && featured.size() < 8) {
                featured.add(productView(p));
            }
        }
        List<Object> latest = new ArrayList<>();
        List<Map<String, Object>> ps = publishedPosts();
        for (int i = 0; i < ps.size() && i < 3; i++) {
            latest.add(postCard(ps.get(i)));
        }
        return M.map("featured", featured, "posts", latest, "promo", Logic.dayPromo());
    }

    static Object products(Req r) {
        String cat = r.q.getOrDefault("cat", "");
        String q = r.q.getOrDefault("q", "").toLowerCase(Locale.ROOT).trim();
        String sort = r.q.getOrDefault("sort", "");
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> p : Db.products.all()) {
            if (!cat.isEmpty() && !M.s(p, "cat").equals(cat)) {
                continue;
            }
            if (!q.isEmpty() && !(M.s(p, "name") + " " + M.s(p, "brand")).toLowerCase(Locale.ROOT).contains(q)) {
                continue;
            }
            rows.add(p);
        }
        switch (sort) {
            case "price_asc":
                rows.sort((a, b) -> Double.compare(M.d(a, "price"), M.d(b, "price")));
                break;
            case "price_desc":
                rows.sort((a, b) -> Double.compare(M.d(b, "price"), M.d(a, "price")));
                break;
            case "new":
                rows.sort((a, b) -> Long.compare(M.l(b, "id"), M.l(a, "id")));
                break;
            default:
                break;
        }
        List<Object> out = new ArrayList<>();
        for (Map<String, Object> p : rows) {
            out.add(productView(p));
        }
        return out;
    }

    static Object product(long id) {
        Map<String, Object> p = Db.products.find(id);
        if (p == null) {
            throw new ApiError(404, "Товар не найден: возможно, его уже сняли с продажи.");
        }
        Map<String, Object> v = productView(p);
        List<Object> similar = new ArrayList<>();
        for (Map<String, Object> o : Db.products.all()) {
            if (M.s(o, "cat").equals(M.s(p, "cat")) && M.l(o, "id") != id && similar.size() < 4) {
                similar.add(productView(o));
            }
        }
        v.put("similar", similar);
        return v;
    }

    static List<Map<String, Object>> publishedPosts() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> p : Db.posts.all()) {
            if (M.b(p, "published")) {
                list.add(p);
            }
        }
        list.sort((a, b) -> Long.compare(M.l(b, "created"), M.l(a, "created")));
        return list;
    }

    static Map<String, Object> postCard(Map<String, Object> p) {
        String text = M.s(p, "text").replaceAll("(?m)^## .*$", "").replaceAll("\\s+", " ").trim();
        String excerpt = text.length() > 150 ? text.substring(0, 150).trim() + "…" : text;
        return M.map("id", p.get("id"), "title", p.get("title"), "category", p.get("category"),
                "excerpt", excerpt, "cover", M.s(p, "cover"), "created", p.get("created"),
                "views", M.l(p, "views"), "hasVideo", !M.s(p, "videoType").equals("none") && !M.s(p, "videoUrl").isEmpty());
    }

    static Object posts(Req r) {
        String cat = r.q.getOrDefault("cat", "");
        String q = r.q.getOrDefault("q", "").toLowerCase(Locale.ROOT).trim();
        List<Object> out = new ArrayList<>();
        for (Map<String, Object> p : publishedPosts()) {
            if (!cat.isEmpty() && !M.s(p, "category").equals(cat)) {
                continue;
            }
            if (!q.isEmpty() && !(M.s(p, "title") + " " + M.s(p, "text")).toLowerCase(Locale.ROOT).contains(q)) {
                continue;
            }
            out.add(postCard(p));
        }
        return out;
    }

    static Object post(long id) {
        Map<String, Object> p = Db.posts.find(id);
        if (p == null || !M.b(p, "published")) {
            throw new ApiError(404, "Статья не найдена или ещё не опубликована.");
        }
        p.put("views", M.l(p, "views") + 1);
        Db.posts.save();
        Map<String, Object> v = postCard(p);
        v.put("text", M.s(p, "text"));
        v.put("videoType", M.s(p, "videoType"));
        v.put("videoUrl", M.s(p, "videoUrl"));
        v.put("gallery", p.get("gallery") == null ? new ArrayList<>() : p.get("gallery"));
        v.put("author", M.s(p, "author"));
        v.put("views", M.l(p, "views"));
        return v;
    }

    // ================= реклама =================

    static boolean adIsLive(Map<String, Object> a) {
        if (!M.b(a, "active")) {
            return false;
        }
        String until = M.s(a, "until");
        return until.isEmpty() || until.compareTo(LocalDate.now().toString()) >= 0;
    }

    static Map<String, Object> adView(Map<String, Object> a) {
        return M.map("id", a.get("id"), "placement", a.get("placement"), "title", a.get("title"), "text", M.s(a, "text"),
                "button", M.s(a, "button"), "link", M.s(a, "link"), "image", M.s(a, "image"), "color", M.s(a, "color"));
    }

    static Object ads() {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String place : new String[]{"top", "side", "feed", "popup", "bottom", "video"}) {
            out.put(place, new ArrayList<>());
        }
        for (Map<String, Object> a : Db.ads.all()) {
            if (adIsLive(a)) {
                Object list = out.get(M.s(a, "placement"));
                if (list != null) {
                    M.asList(list).add(adView(a));
                }
            }
        }
        return out;
    }

    static Object adEvent(Req r) {
        Map<String, Object> a = Db.ads.find(r.id());
        if (a == null) {
            throw new ApiError(404, "Реклама не найдена.");
        }
        String kind = r.m.group(2).equals("view") ? "views" : "clicks";
        a.put(kind, M.l(a, kind) + 1);
        Db.ads.save();
        return M.map("ok", true);
    }

    // ================= инструменты (услуги, поддержка) =================

    static Object tool(Req r) {
        Params p = new Params(r.body);
        switch (r.m.group(1)) {
            case "service":
                return Logic.serviceCalc(p);
            case "tradein":
                return Logic.tradeIn(p);
            case "warranty":
                return Logic.warranty(p);
            case "return":
                return Logic.returnCheck(p);
            case "finance":
                return Logic.finance(p);
            case "advisor":
                return advisor(p);
            default:
                throw new ApiError(404, "Такого инструмента нет.");
        }
    }

    static Object advisor(Params p) {
        int goal = p.integer("goal", "Цель", 1, 4);
        double budget = p.number("budget", "Бюджет", 1, 1000000000);
        Map<String, Object> res = Logic.advise(goal, budget);
        List<Object> picks = new ArrayList<>();
        for (Object cat : M.asList(res.get("cats"))) {
            Map<String, Object> best = null;
            for (Map<String, Object> pr : Db.products.all()) {
                if (M.s(pr, "cat").equals(cat) && M.l(pr, "stock") > 0 && M.d(pr, "price") <= budget) {
                    if (best == null || M.d(pr, "price") > M.d(best, "price")) {
                        best = pr;
                    }
                }
            }
            if (best != null) {
                picks.add(productView(best));
            }
        }
        res.put("products", picks);
        return res;
    }

    // ================= корзина, заказ =================

    static final class Quote {
        final Map<String, Object> view = new LinkedHashMap<>();
        final List<String> problems = new ArrayList<>();
        final List<Map<String, Object>> products = new ArrayList<>();
        final List<Integer> qtys = new ArrayList<>();
        double total;
        int maxSame;
        String paymentName = "";
    }

    static Quote makeQuote(Map<String, Object> user, Object itemsObj, String city, String method, String payment) {
        Quote q = new Quote();
        if (city.isEmpty()) {
            city = "astana";
        }
        if (method.isEmpty()) {
            method = "pickup";
        }
        if (payment.isEmpty()) {
            payment = "card";
        }
        if (!city.equals("astana") && !city.equals("almaty") && !city.equals("other")) {
            throw new ApiError(400, "Выберите город из списка.");
        }
        Map<Long, Integer> qty = new LinkedHashMap<>();
        for (Object o : M.asList(itemsObj)) {
            Map<String, Object> im = M.asMap(o);
            int n = (int) Math.max(1, Math.min(99, M.l(im, "qty")));
            qty.merge(M.l(im, "id"), n, Integer::sum);
        }
        if (qty.isEmpty()) {
            q.problems.add("Корзина пуста. Добавьте товары из каталога.");
        }
        Map<String, Object> promo = Logic.dayPromo();
        String promoCat = M.s(promo, "cat");
        double promoPct = M.d(promo, "percent");
        double promoAmount = 0;
        double subtotal = 0;
        double weight = 0;
        List<Object> lines = new ArrayList<>();
        for (Map.Entry<Long, Integer> e : qty.entrySet()) {
            Map<String, Object> p = Db.products.find(e.getKey());
            if (p == null) {
                q.problems.add("Один из товаров больше не продаётся. Удалите его из корзины.");
                continue;
            }
            int n = Math.min(e.getValue(), 99);
            long stock = M.l(p, "stock");
            if (stock <= 0) {
                q.problems.add("«" + M.s(p, "name") + "» нет в наличии. Удалите товар из корзины.");
            } else if (n > stock) {
                q.problems.add("«" + M.s(p, "name") + "»: в наличии только " + stock + " шт. Уменьшите количество.");
            }
            double sum = M.d(p, "price") * n;
            subtotal += sum;
            weight += M.d(p, "weight") * n;
            if (promoPct > 0 && promoCat.equals(M.s(p, "cat"))) {
                promoAmount += sum * promoPct / 100;
            }
            q.products.add(p);
            q.qtys.add(n);
            q.maxSame = Math.max(q.maxSame, n);
            lines.add(M.map("id", p.get("id"), "name", p.get("name"), "price", M.d(p, "price"), "qty", n,
                    "sum", sum, "image", M.s(p, "image"), "cat", p.get("cat"), "stock", stock));
        }

        List<Map<String, Object>> orders = ordersOf(user);
        String status = user == null ? "new" : Logic.loyaltyStatus(user, orders, null);
        int age = user == null ? -1 : Logic.age(M.s(user, "birth"));
        List<Object> reasons = new ArrayList<>();
        double pct = Logic.baseDiscount(subtotal);
        if (pct > 0) {
            reasons.add("за сумму покупки: " + Logic.pct(pct));
        }
        double bonus = Logic.statusBonus(status);
        if (bonus > 0) {
            reasons.add(Logic.loyaltyText(status) + ": +" + Logic.pct(bonus));
        }
        double ageBonus = age >= 60 ? 5 : 0;
        if (ageBonus > 0) {
            reasons.add("скидка для пенсионеров: +5%");
        }
        pct = Math.min(20, pct + bonus + ageBonus);
        double discount = Math.round(subtotal * pct / 100);
        double promoRounded = Math.round(promoAmount);
        double goods = subtotal - discount - promoRounded;

        Map<String, Object> delivery = Logic.delivery(method, city, weight, goods);
        q.total = goods + M.d(delivery, "cost");
        try {
            q.paymentName = Logic.paymentName(payment, method, city);
        } catch (ApiError ex) {
            q.problems.add(ex.getMessage());
        }
        Map<String, Object> inst = Logic.installment(age, user == null ? 0 : M.d(user, "income"),
                user != null && M.b(user, "blocked"), q.total);
        if (payment.equals("installment") && !M.b(inst, "available")) {
            q.problems.add(M.s(inst, "reason"));
        }

        q.view.put("lines", lines);
        q.view.put("subtotal", subtotal);
        q.view.put("discount", M.map("percent", pct, "amount", discount, "reasons", reasons));
        q.view.put("promo", M.map("title", promo.get("title"), "amount", promoRounded, "weekend", promo.get("weekend")));
        q.view.put("delivery", delivery);
        q.view.put("total", q.total);
        q.view.put("installment", inst);
        q.view.put("paymentName", q.paymentName);
        q.view.put("giftNote", M.b(promo, "weekend") && goods >= 100000
                ? "В выходные к заказу от 100 000 ₸ — подарочная плёнка или коврик для мыши." : "");
        q.view.put("problems", q.problems);
        return q;
    }

    static Object quoteApi(Req r) {
        Map<String, Object> b = r.body;
        return makeQuote(r.user, b.get("items"), M.s(b, "city"), M.s(b, "method"), M.s(b, "payment")).view;
    }

    static Object checkout(Req r) {
        Map<String, Object> u = requireUser(r);
        if (M.b(u, "blocked")) {
            throw new ApiError(403, "Аккаунт заблокирован: оформление заказов недоступно. Обратитесь в поддержку.");
        }
        int age = Logic.age(M.s(u, "birth"));
        if (age >= 0 && age < 14) {
            throw new ApiError(403, "Оформлять заказы самостоятельно можно с 14 лет. Попросите родителей сделать заказ.");
        }
        Map<String, Object> b = r.body;
        Params p = new Params(b);
        String phone = p.str("phone", "Телефон");
        if (phone.replaceAll("\\D", "").length() < 10) {
            throw new ApiError(400, "Телефон: не меньше 10 цифр.");
        }
        String method = M.s(b, "method");
        String address = M.s(b, "address");
        if (method.equals("courier") && address.length() < 5) {
            throw new ApiError(400, "Для курьерской доставки укажите адрес: улица, дом, квартира.");
        }
        Quote q = makeQuote(u, b.get("items"), M.s(b, "city"), method, M.s(b, "payment"));
        if (!q.problems.isEmpty()) {
            throw new ApiError(400, q.problems.get(0));
        }

        List<Map<String, Object>> mine = ordersOf(u);
        long hourAgo = System.currentTimeMillis() - 3600000L;
        int recent = 0;
        for (Map<String, Object> o : mine) {
            if (M.l(o, "created") >= hourAgo) {
                recent++;
            }
        }
        Map<String, Object> risk = Logic.risk(q.total, mine.isEmpty(), recent, q.maxSame);
        String status;
        switch (M.s(risk, "level")) {
            case "high":
                status = "review";
                break;
            case "medium":
                status = "call";
                break;
            default:
                status = "new";
                break;
        }

        List<Object> items = new ArrayList<>();
        for (int i = 0; i < q.products.size(); i++) {
            Map<String, Object> pr = q.products.get(i);
            int n = q.qtys.get(i);
            pr.put("stock", M.l(pr, "stock") - n);
            items.add(M.map("id", pr.get("id"), "name", pr.get("name"), "price", M.d(pr, "price"), "qty", n));
        }
        Db.products.save();

        Map<String, Object> disc = M.asMap(q.view.get("discount"));
        Map<String, Object> promo = M.asMap(q.view.get("promo"));
        Map<String, Object> delivery = M.asMap(q.view.get("delivery"));
        Map<String, Object> order = Db.orders.insert(M.map(
                "userId", u.get("id"), "userName", u.get("name"), "items", items,
                "subtotal", q.view.get("subtotal"), "discount", disc.get("amount"), "discountPercent", disc.get("percent"),
                "promo", promo.get("amount"), "delivery", delivery.get("cost"), "total", q.total,
                "city", M.s(b, "city").isEmpty() ? "astana" : M.s(b, "city"), "method", method.isEmpty() ? "pickup" : method,
                "address", address, "phone", phone, "payment", M.s(b, "payment").isEmpty() ? "card" : M.s(b, "payment"),
                "paymentName", q.paymentName, "comment", M.s(b, "comment"), "status", status, "risk", risk,
                "created", System.currentTimeMillis(), "rating", -1));
        Db.event("Заказ №" + order.get("id") + " на " + Logic.money(q.total) + ": риск "
                + M.s(risk, "level").replace("high", "высокий").replace("medium", "средний").replace("low", "низкий")
                + ", статус «" + statusRu(status) + "»");

        if (M.s(u, "phone").isEmpty()) {
            u.put("phone", phone);
        }
        if (M.s(u, "address").isEmpty() && !address.isEmpty()) {
            u.put("address", address);
        }
        Db.users.save();
        return orderView(order);
    }

    static String statusRu(String s) {
        switch (s) {
            case "new":
                return "Принят";
            case "call":
                return "Ждёт звонка менеджера";
            case "review":
                return "На проверке";
            case "shipped":
                return "Отправлен";
            case "done":
                return "Выполнен";
            case "cancelled":
                return "Отменён";
            case "returned":
                return "Возврат";
            default:
                return s;
        }
    }

    static Map<String, Object> orderView(Map<String, Object> o) {
        Map<String, Object> v = new LinkedHashMap<>(o);
        v.put("statusText", statusRu(M.s(o, "status")));
        v.put("cityName", Logic.cityName(M.s(o, "city")));
        return v;
    }

    static Object myOrders(Req r) {
        Map<String, Object> u = requireUser(r);
        List<Object> out = new ArrayList<>();
        List<Map<String, Object>> list = ordersOf(u);
        Collections.reverse(list);
        for (Map<String, Object> o : list) {
            Map<String, Object> v = orderView(o);
            v.remove("risk");
            out.add(v);
        }
        return out;
    }

    static Object rateOrder(Req r) {
        Map<String, Object> u = requireUser(r);
        Map<String, Object> o = Db.orders.find(r.id());
        if (o == null || M.l(o, "userId") != M.l(u, "id")) {
            throw new ApiError(404, "Заказ не найден.");
        }
        if (!M.s(o, "status").equals("done")) {
            throw new ApiError(400, "Оценить можно только выполненный заказ.");
        }
        int points = new Params(r.body).integer("points", "Оценка", 0, 100);
        o.put("rating", points);
        Db.orders.save();
        Map<String, Object> g = Logic.grade(points);
        return M.map("mark", g.get("mark"), "passed", g.get("passed"));
    }
}
