"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || "";

interface MediaItem {
  id: string;
  title: string;
  category: string;
  rating: number;
  watched: boolean;
  poster_url?: string;
  release_year?: string;
  owner: string;
  is_shared_club: boolean;
  is_legend: boolean;
  group_name?: string;
}

interface CommentItem {
  id: string;
  media_id: string;
  username: string;
  content: string;
  is_spoiler: boolean;
  parent_id: string | null;
  created_at: string;
  group_name?: string;
  season_num?: number | null;
  episode_num?: number | null;
}

interface InviteItem {
  id: string;
  code: string;
  created_by: string;
  is_used: boolean;
  used_by?: string;
  is_single_use?: boolean;
  group_name?: string;
}

const CATEGORIES = [
  "Türk Dram",
  "Yabancı Dram",
  "Türk Komedi",
  "Yabancı Komedi",
  "Türk Korku",
  "Yabancı Korku",
  "Türk Bilim Kurgu / Gerilim",
  "Yabancı Bilim Kurgu / Gerilim",
  "Türk Romantik",
  "Yabancı Romantik",
  "Türk Aksiyon",
  "Yabancı Aksiyon",
  "Animasyon",
  "Dizi",
];

export default function KadrajApp() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [loginName, setLoginName] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [authError, setAuthError] = useState("");

  const [activeTab, setActiveTab] = useState<
    "legends" | "shared" | "personal" | "whatToWatch" | "discussions" | "invites"
  >("legends");

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [userGroups, setUserGroups] = useState<string[]>(["Genel Kulüp"]);
  const [selectedGroup, setSelectedGroup] = useState<string>("Genel Kulüp");
  const [joinGroupCode, setJoinGroupCode] = useState("");

  // Arama & Ekleme State'leri
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTarget, setAddTarget] = useState<"personal" | "shared">("personal");
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Yabancı Dram");
  const [newRating, setNewRating] = useState(8);
  const [newWatched, setNewWatched] = useState(true);
  const [newPoster, setNewPoster] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newIsLegend, setNewIsLegend] = useState(false);

  // Filtreler
  const [searchFilter, setSearchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Tümü");
  const [watchedFilter, setWatchedFilter] = useState<"all" | "watched" | "unwatched">("all");
  const [selectedMemberLegend, setSelectedMemberLegend] = useState<string>("Tümü");

  // Tartışma State'leri
  const [selectedDiscussionTitle, setSelectedDiscussionTitle] = useState<string>("");
  const [discussionSearch, setDiscussionSearch] = useState("");
  const [newCommentText, setNewCommentText] = useState("");
  const [newCommentSpoiler, setNewCommentSpoiler] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});
  const [commentSeason, setCommentSeason] = useState<number | "">("");
  const [commentEpisode, setCommentEpisode] = useState<number | "">("");
  const [filterSeason, setFilterSeason] = useState<number | "all">("all");
  const [filterEpisode, setFilterEpisode] = useState<number | "all">("all");

  // Bugün Ne İzlesek State'leri
  const [wheelGroup, setWheelGroup] = useState<string>("Genel Kulüp");
  const [wheelGenre, setWheelGenre] = useState<string>("Tümü");
  const [wheelMode, setWheelMode] = useState<"archive" | "tmdb">("archive");
  const [wheelResult, setWheelResult] = useState<any | null>(null);
  const [wheelReason, setWheelReason] = useState<string>("");
  const [isSpinning, setIsSpinning] = useState(false);

  // Davet Kodu Üretme State'i
  const [newInviteGroupName, setNewInviteGroupName] = useState("Genel Kulüp");

  // Kurucu kontrolü (Duhan)
  const isFounder = useMemo(() => {
    return currentUser?.trim().toLowerCase() === "duhan";
  }, [currentUser]);

  // İlk Yükleme ve Tek Kullanımlık Misafir Linki Kontrolü
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const guestCode = params.get("guest");

    if (guestCode) {
      handleGuestLinkLogin(guestCode);
    } else {
      const savedUser = localStorage.getItem("kadraj_user");
      const savedGuest = localStorage.getItem("kadraj_is_guest") === "true";
      if (savedUser) {
        setCurrentUser(savedUser);
        setIsGuest(savedGuest);
      }
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchAllData();
    }
  }, [currentUser]);

  const handleGuestLinkLogin = async (code: string) => {
    const { data, error } = await supabase
      .from("invites")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !data || data.is_used) {
      setAuthError("Bu tek kullanımlık Gezen Davuk bağlantısı daha önce kullanılmış veya geçersiz!");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    await supabase
      .from("invites")
      .update({ is_used: true, used_by: "Gezen Davuk" })
      .eq("id", data.id);

    setCurrentUser("Gezen Davuk");
    setIsGuest(true);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const fetchAllData = async () => {
    const { data: mData } = await supabase
      .from("media_items")
      .select("*")
      .order("id", { ascending: false });
    if (mData) setMediaItems(mData);

    const { data: cData } = await supabase
      .from("comments")
      .select("*")
      .order("created_at", { ascending: true });
    if (cData) setComments(cData);

    const { data: iData } = await supabase
      .from("invites")
      .select("*")
      .order("id", { ascending: false });
    if (iData) setInvites(iData);

    if (currentUser) {
      const { data: gData } = await supabase
        .from("user_groups")
        .select("group_name")
        .ilike("username", currentUser.trim());

      const groups = new Set<string>(["Genel Kulüp"]);
      if (gData) {
        gData.forEach((g: any) => {
          if (g.group_name) groups.add(g.group_name);
        });
      }
      // Kurucu tüm grupları görebilir
      if (currentUser.trim().toLowerCase() === "duhan" && iData) {
        iData.forEach((inv: any) => {
          if (inv.group_name) groups.add(inv.group_name);
        });
      }
      const groupList = Array.from(groups);
      setUserGroups(groupList);
      if (!groupList.includes(selectedGroup)) {
        setSelectedGroup(groupList[0]);
      }
    }
  };

  // Giriş İşlemi
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    const cleanName = loginName.trim();
    const cleanCode = inviteCodeInput.trim().toUpperCase();

    if (!cleanName || !cleanCode) {
      setAuthError("Lütfen adınızı ve davet kodunuzu girin.");
      return;
    }

    let targetGroup = "Genel Kulüp";

    if (cleanCode !== "KDRJ2026") {
      const { data: inv, error } = await supabase
        .from("invites")
        .select("*")
        .eq("code", cleanCode)
        .single();

      if (error || !inv) {
        setAuthError("Geçersiz davet kodu!");
        return;
      }
      targetGroup = inv.group_name || "Genel Kulüp";

      if (!inv.is_used) {
        await supabase
          .from("invites")
          .update({ is_used: true, used_by: cleanName })
          .eq("id", inv.id);
      }
    }

    await supabase
      .from("user_groups")
      .upsert(
        { username: cleanName, group_name: targetGroup },
        { onConflict: "username,group_name" }
      );

    localStorage.setItem("kadraj_user", cleanName);
    localStorage.setItem("kadraj_is_guest", "false");
    setCurrentUser(cleanName);
    setIsGuest(false);
    setSelectedGroup(targetGroup);
  };

  const handleLogout = () => {
    localStorage.removeItem("kadraj_user");
    localStorage.removeItem("kadraj_is_guest");
    setCurrentUser(null);
    setIsGuest(false);
  };

  // Yeni Gruba Katılma
  const handleJoinNewGroup = async () => {
    if (!joinGroupCode.trim() || !currentUser) return;
    const code = joinGroupCode.trim().toUpperCase();
    const { data: inv, error } = await supabase
      .from("invites")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !inv || !inv.group_name) {
      alert("Geçersiz grup davet kodu!");
      return;
    }

    await supabase
      .from("user_groups")
      .upsert(
        { username: currentUser, group_name: inv.group_name },
        { onConflict: "username,group_name" }
      );

    setJoinGroupCode("");
    await fetchAllData();
    setSelectedGroup(inv.group_name);
    alert(`"${inv.group_name}" grubuna başarıyla katıldın!`);
  };

  // TMDB Canlı Arama
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (tmdbQuery.trim().length < 2 || !TMDB_API_KEY) {
        setTmdbResults([]);
        return;
      }
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=tr-TR&query=${encodeURIComponent(
            tmdbQuery
          )}`
        );
        const data = await res.json();
        setTmdbResults(
          (data.results || []).filter(
            (r: any) => r.media_type === "movie" || r.media_type === "tv"
          )
        );
      } catch (err) {
        console.error(err);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [tmdbQuery]);

  const selectTmdbItem = (item: any) => {
    const title = item.title || item.name || "";
    const year = (item.release_date || item.first_air_date || "").slice(0, 4);
    const poster = item.poster_path
      ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
      : "";
    const isTv = item.media_type === "tv";
    const isTr = item.original_language === "tr";

    setNewTitle(title);
    setNewYear(year);
    setNewPoster(poster);
    if (item.vote_average) {
      setNewRating(Math.max(1, Math.round(item.vote_average)));
    }
    if (isTv) {
      setNewCategory("Dizi");
    } else {
      setNewCategory(isTr ? "Türk Dram" : "Yabancı Dram");
    }
    setTmdbResults([]);
    setTmdbQuery("");
  };

  // Film / Dizi Ekleme (Mükerrer / Çift Kayıt Engelli)
  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentUser || isGuest) return;

    const normalizedTitle = newTitle.trim().toLowerCase();
    const isShared = addTarget === "shared";
    const targetGrp = isShared ? selectedGroup : "Kişisel";

    // Çift ekleme kontrolü
    const alreadyExists = mediaItems.some((m) => {
      const sameTitle = m.title.trim().toLowerCase() === normalizedTitle;
      if (!sameTitle) return false;
      if (isShared) {
        return m.is_shared_club && (m.group_name || "Genel Kulüp") === selectedGroup;
      } else {
        return (
          !m.is_shared_club &&
          m.owner?.trim().toLowerCase() === currentUser.trim().toLowerCase()
        );
      }
    });

    if (alreadyExists) {
      alert(`"${newTitle.trim()}" zaten bu listede mevcut! Aynı yapımı iki kez ekleyemezsiniz.`);
      return;
    }

    const payload = {
      title: newTitle.trim(),
      category: newCategory,
      rating: newRating,
      watched: newWatched,
      poster_url: newPoster || null,
      release_year: newYear || null,
      owner: currentUser.trim(),
      is_shared_club: isShared,
      is_legend: newIsLegend,
      group_name: targetGrp,
    };

    const { data, error } = await supabase
      .from("media_items")
      .insert([payload])
      .select()
      .single();

    if (error) {
      alert("Ekleme hatası: " + error.message);
      return;
    }

    if (data) {
      setMediaItems([data, ...mediaItems]);
    }
    setNewTitle("");
    setNewPoster("");
    setNewYear("");
    setNewIsLegend(false);
    setShowAddModal(false);
  };

  // Listeden Çıkarma (Silme)
  const handleDeleteMedia = async (item: MediaItem) => {
    if (isGuest) return;
    const confirmed = window.confirm(
      `"${item.title}" yapımını listeden tamamen çıkarmak istediğinize emin misiniz?`
    );
    if (!confirmed) return;

    const { error } = await supabase.from("media_items").delete().eq("id", item.id);
    if (error) {
      alert("Silinirken hata oluştu: " + error.message);
      return;
    }
    setMediaItems((prev) => prev.filter((m) => m.id !== item.id));
  };

  // İzlendi Durumu Değiştirme
  const toggleWatched = async (item: MediaItem) => {
    if (isGuest) return;
    const updated = !item.watched;
    await supabase.from("media_items").update({ watched: updated }).eq("id", item.id);
    setMediaItems((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, watched: updated } : m))
    );
  };

  // Kurucu Efsanesi veya Üye Efsanesi Durumu Değiştirme
  const toggleLegendStatus = async (item: MediaItem, makeFounderLegend = false) => {
    if (isGuest) return;
    const updatedLegend = !item.is_legend;
    const updatedOwner =
      makeFounderLegend && isFounder ? "Duhan" : item.owner;

    const { error } = await supabase
      .from("media_items")
      .update({ is_legend: updatedLegend, owner: updatedOwner })
      .eq("id", item.id);

    if (!error) {
      setMediaItems((prev) =>
        prev.map((m) =>
          m.id === item.id
            ? { ...m, is_legend: updatedLegend, owner: updatedOwner }
            : m
        )
      );
    }
  };

  // Tekil Tartışma Listesi (Aynı İsimli Filmleri Birleştirir)
  const uniqueDiscussionMovies = useMemo(() => {
    const map = new Map<string, MediaItem>();
    mediaItems.forEach((m) => {
      const key = m.title.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, m);
      }
    });
    return Array.from(map.values()).filter((m) =>
      m.title.toLowerCase().includes(discussionSearch.toLowerCase())
    );
  }, [mediaItems, discussionSearch]);

  // Seçili Filmin Tüm ID Eşleşmeleri (3 farklı kayıt olsa bile yorumları tek yerde toplar)
  const selectedMovieIds = useMemo(() => {
    if (!selectedDiscussionTitle) return [];
    const targetKey = selectedDiscussionTitle.trim().toLowerCase();
    return mediaItems
      .filter((m) => m.title.trim().toLowerCase() === targetKey)
      .map((m) => String(m.id));
  }, [mediaItems, selectedDiscussionTitle]);

  // Yorum Gönderme
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !selectedDiscussionTitle || !currentUser || isGuest)
      return;

    const primaryMediaId = selectedMovieIds[0];
    if (!primaryMediaId) return;

    const payload = {
      media_id: primaryMediaId,
      username: currentUser,
      content: newCommentText.trim(),
      is_spoiler: newCommentSpoiler,
      parent_id: replyToId,
      group_name: selectedGroup,
      season_num: commentSeason === "" ? null : Number(commentSeason),
      episode_num: commentEpisode === "" ? null : Number(commentEpisode),
    };

    const { data, error } = await supabase
      .from("comments")
      .insert([payload])
      .select()
      .single();

    if (!error && data) {
      setComments([...comments, data]);
      setNewCommentText("");
      setNewCommentSpoiler(false);
      setReplyToId(null);
    }
  };

  // "Bugün Ne İzlesek?" Öneri Motoru
  const handleSpinWheel = async () => {
    setIsSpinning(true);
    setWheelResult(null);

    setTimeout(async () => {
      const groupItems = mediaItems.filter(
        (m) =>
          (m.is_shared_club && (m.group_name || "Genel Kulüp") === wheelGroup) ||
          !m.is_shared_club
      );

      if (wheelMode === "archive") {
        let candidates = groupItems.filter((m) => !m.watched);
        if (wheelGenre !== "Tümü") {
          candidates = candidates.filter((m) =>
            m.category.toLowerCase().includes(wheelGenre.toLowerCase())
          );
        }

        if (candidates.length > 0) {
          const picked = candidates[Math.floor(Math.random() * candidates.length)];
          setWheelResult({
            title: picked.title,
            poster_url: picked.poster_url,
            release_year: picked.release_year,
            rating: picked.rating,
            category: picked.category,
          });
          setWheelReason(
            `🎯 "${wheelGroup}" arşivinde veya üyelerin izleme listesinde bulunuyor ve henüz izlenmedi! (Öneren: ${picked.owner})`
          );
        } else {
          setWheelReason(
            "Bu kriterde izlenmemiş arşiv yapımı bulunamadı. 'TMDB Akıllı Keşif' modunu deneyin!"
          );
        }
        setIsSpinning(false);
      } else {
        // TMDB Akıllı Keşif
        try {
          const watchedTitles = new Set(
            groupItems.map((m) => m.title.trim().toLowerCase())
          );
          const genreMap: Record<string, string> = {
            Tümü: "",
            Dram: "18",
            Komedi: "35",
            Korku: "27",
            Aksiyon: "28",
            "Bilim Kurgu / Gerilim": "878,53",
            Animasyon: "16",
          };
          const genreParam = genreMap[wheelGenre]
            ? `&with_genres=${genreMap[wheelGenre]}`
            : "";
          const randomPage = Math.floor(Math.random() * 5) + 1;

          const res = await fetch(
            `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=tr-TR&sort_by=vote_average.desc&vote_count.gte=500${genreParam}&page=${randomPage}`
          );
          const data = await res.json();
          const pool = (data.results || []).filter(
            (r: any) => !watchedTitles.has((r.title || "").trim().toLowerCase())
          );

          if (pool.length > 0) {
            const picked = pool[Math.floor(Math.random() * pool.length)];
            setWheelResult({
              title: picked.title,
              poster_url: picked.poster_path
                ? `https://image.tmdb.org/t/p/w500${picked.poster_path}`
                : "",
              release_year: (picked.release_date || "").slice(0, 4),
              rating: Math.round(picked.vote_average || 8),
              category: wheelGenre === "Tümü" ? "Özel Keşif" : wheelGenre,
              overview: picked.overview,
            });
            setWheelReason(
              `🔥 "${wheelGroup}" üyelerinin henüz izlemediği, yüksek puanlı (${picked.vote_average?.toFixed(
                1
              )}/10) TMDB önerisi!`
            );
          }
        } catch (e) {
          console.error(e);
        }
        setIsSpinning(false);
      }
    }, 700);
  };

  // Davet Kodu ve Tek Kullanımlık Link Üretme
  const generateInviteCode = async (singleUseGuest = false) => {
    if (isGuest) return;
    const prefix = singleUseGuest ? "DAVUK-" : "KDRJ-";
    const randomCode =
      prefix + Math.random().toString(36).substring(2, 7).toUpperCase();

    const { data, error } = await supabase
      .from("invites")
      .insert([
        {
          code: randomCode,
          created_by: currentUser,
          is_used: false,
          group_name: newInviteGroupName.trim() || "Genel Kulüp",
        },
      ])
      .select()
      .single();

    if (!error && data) {
      setInvites([data, ...invites]);
      if (singleUseGuest) {
        const guestUrl = `${window.location.origin}?guest=${randomCode}`;
        navigator.clipboard.writeText(guestUrl);
        alert(
          `Tek kullanımlık "Gezen Davuk" misafir bağlantısı kopyalandı:\n\n${guestUrl}`
        );
      }
    }
  };

  // Efsanelerim Listesi Ayrımı (Kurucunun Efsaneleri vs Üyelerin Efsaneleri)
  const founderLegends = useMemo(() => {
    const seen = new Set<string>();
    return mediaItems.filter((m) => {
      if (!m.is_legend) return false;
      const isOwnerFounder =
        m.owner?.toLowerCase() === "kurucu" || m.owner?.toLowerCase() === "duhan";
      if (!isOwnerFounder) return false;
      const key = m.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [mediaItems]);

  const memberLegends = useMemo(() => {
    return mediaItems.filter((m) => {
      if (!m.is_legend) return false;
      const isOwnerFounder =
        m.owner?.toLowerCase() === "kurucu" || m.owner?.toLowerCase() === "duhan";
      if (isOwnerFounder) return false;
      if (
        selectedMemberLegend !== "Tümü" &&
        m.owner?.toLowerCase() !== selectedMemberLegend.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [mediaItems, selectedMemberLegend]);

  // Giriş Ekranı
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#131b2e] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-extrabold text-amber-500 tracking-wider">
              🎬 KADRAJ
            </h1>
            <p className="text-gray-400 text-sm mt-2">
              Özel Sinema & Dizi Arşiv Kulübü
            </p>
          </div>
          {authError && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 text-sm p-3 rounded-lg mb-4">
              {authError}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                KULLANICI ADINIZ
              </label>
              <input
                type="text"
                placeholder="Örn: Duhan"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                GRUP / KULÜP DAVET KODU
              </label>
              <input
                type="text"
                placeholder="Örn: KDRJ2026 veya KONYA26"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                className="w-full bg-[#0b0f17] border border-gray-700 rounded-lg px-4 py-3 text-white uppercase focus:border-amber-500 outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-lg transition"
            >
              Kulübe Giriş Yap
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Aktif Sekmeye Göre Filmleri Filtreleme
  const displayedMedia = mediaItems.filter((item) => {
    if (activeTab === "shared") {
      if (!item.is_shared_club) return false;
      if ((item.group_name || "Genel Kulüp") !== selectedGroup) return false;
    } else if (activeTab === "personal") {
      if (item.is_shared_club) return false;
      if (item.owner?.trim().toLowerCase() !== currentUser.trim().toLowerCase())
        return false;
    } else {
      return false;
    }

    if (
      searchFilter &&
      !item.title.toLowerCase().includes(searchFilter.toLowerCase())
    )
      return false;
    if (categoryFilter !== "Tümü" && item.category !== categoryFilter)
      return false;
    if (watchedFilter === "watched" && !item.watched) return false;
    if (watchedFilter === "unwatched" && item.watched) return false;

    return true;
  });

  return (
    <div className="min-h-screen bg-[#0b0f17] text-gray-100 flex flex-col">
      {/* Üst Bar */}
      <header className="border-b border-gray-800 bg-[#111827]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-amber-500 tracking-wider">
              🎬 KADRAJ
            </span>
            <span className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2.5 py-1 rounded-full">
              {isGuest
                ? "🐔 Gezen Davuk (Misafir)"
                : isFounder
                ? `👑 ${currentUser} (Kurucu)`
                : `👤 ${currentUser}`}
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab("legends")}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === "legends"
                  ? "bg-amber-500 text-black"
                  : "bg-gray-800/70 text-gray-300 hover:bg-gray-700"
              }`}
            >
              🏆 Efsanelerim
            </button>
            <button
              onClick={() => setActiveTab("shared")}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === "shared"
                  ? "bg-amber-500 text-black"
                  : "bg-gray-800/70 text-gray-300 hover:bg-gray-700"
              }`}
            >
              📂 Grup Ortak Arşivi
            </button>
            {!isGuest && (
              <button
                onClick={() => setActiveTab("personal")}
                className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
                  activeTab === "personal"
                    ? "bg-amber-500 text-black"
                    : "bg-gray-800/70 text-gray-300 hover:bg-gray-700"
                }`}
              >
                👤 Kişisel Arşivim
              </button>
            )}
            <button
              onClick={() => setActiveTab("whatToWatch")}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === "whatToWatch"
                  ? "bg-amber-500 text-black"
                  : "bg-gray-800/70 text-gray-300 hover:bg-gray-700"
              }`}
            >
              🎲 Bugün Ne İzlesek?
            </button>
            <button
              onClick={() => setActiveTab("discussions")}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === "discussions"
                  ? "bg-amber-500 text-black"
                  : "bg-gray-800/70 text-gray-300 hover:bg-gray-700"
              }`}
            >
              💬 Tartışma ({comments.length})
            </button>
            {!isGuest && (
              <button
                onClick={() => setActiveTab("invites")}
                className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition ${
                  activeTab === "invites"
                    ? "bg-amber-500 text-black"
                    : "bg-gray-800/70 text-gray-300 hover:bg-gray-700"
                }`}
              >
                🔑 Gruplar & Davet
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg text-xs bg-red-900/40 text-red-300 hover:bg-red-800/60 ml-2"
            >
              Çıkış
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 py-8 flex-1">
        {/* 1. EFSANELERİM VİTRİNİ */}
        {activeTab === "legends" && (
          <div className="space-y-10">
            <div className="bg-gradient-to-r from-amber-500/10 via-[#131b2e] to-[#131b2e] border border-amber-500/30 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-amber-400">
                    👑 Kurucunun Efsaneleri (Duhan&apos;ın Seçkisi)
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {isFounder
                      ? "Kurucu yetkisi aktif: Yanlış eklenmiş filmleri '❌ Efsanelerden Çıkar' butonuyla kaldırabilirsin."
                      : "Kulüp kurucusu Duhan tarafından seçilen başyapıtlar."}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {founderLegends.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#0b0f17] border border-gray-800 rounded-xl overflow-hidden flex flex-col justify-between group hover:border-amber-500/50 transition"
                  >
                    <div>
                      {item.poster_url ? (
                        <img
                          src={item.poster_url}
                          alt={item.title}
                          className="w-full h-56 object-cover"
                        />
                      ) : (
                        <div className="w-full h-56 bg-gray-900 flex items-center justify-center text-gray-600 text-xs">
                          Afiş Yok
                        </div>
                      )}
                      <div className="p-3">
                        <h3 className="font-bold text-sm text-white line-clamp-1">
                          {item.title}
                        </h3>
                        <p className="text-xs text-amber-400 mt-1">
                          ★ {item.rating}/10 • {item.category}
                        </p>
                      </div>
                    </div>
                    {isFounder && (
                      <div className="p-2 pt-0">
                        <button
                          onClick={() => toggleLegendStatus(item)}
                          className="w-full text-xs bg-red-900/40 hover:bg-red-700 text-red-200 py-1.5 rounded-lg transition"
                        >
                          ❌ Efsanelerden Çıkar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Üyelerin Efsaneleri */}
            <div className="bg-[#131b2e] border border-gray-800 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h3 className="text-xl font-bold text-white">
                  🌟 Üyelerin Efsane Seçkileri
                </h3>
              </div>
              {memberLegends.length === 0 ? (
                <p className="text-gray-400 text-sm">
                  Henüz diğer üyeler kendi efsane seçkilerini işaretlemedi.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                  {memberLegends.map((item) => (
                    <div
                      key={item.id}
                      className="bg-[#0b0f17] border border-gray-800 rounded-xl p-3"
                    >
                      <h4 className="font-bold text-sm">{item.title}</h4>
                      <p className="text-xs text-amber-400 mt-1">
                        ★ {item.rating}/10 ({item.owner})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. GRUP ORTAK ARŞİVİ VEYA KİŞİSEL ARŞİV */}
        {(activeTab === "shared" || activeTab === "personal") && (
          <div className="space-y-6">
            {/* Grup Seçici Bar (Sadece Ortak Arşivde) */}
            {activeTab === "shared" && (
              <div className="bg-[#131b2e] border border-gray-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400 mr-2">AKTİF GRUP ODASI:</span>
                  {userGroups.map((grp) => (
                    <button
                      key={grp}
                      onClick={() => setSelectedGroup(grp)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        selectedGroup === grp
                          ? "bg-amber-500 text-black"
                          : "bg-[#0b0f17] text-gray-300 border border-gray-700"
                      }`}
                    >
                      📂 {grp}
                    </button>
                  ))}
                </div>

                {!isGuest && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Grup Kodu (Örn: KONYA26)"
                      value={joinGroupCode}
                      onChange={(e) => setJoinGroupCode(e.target.value)}
                      className="bg-[#0b0f17] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white uppercase"
                    />
                    <button
                      onClick={handleJoinNewGroup}
                      className="bg-gray-800 hover:bg-gray-700 text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-700"
                    >
                      + Gruba Katıl
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Başlık ve Yeni Yapım Ekle Butonu */}
            <div className="bg-[#131b2e] border border-gray-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-amber-500">
                  {activeTab === "shared"
                    ? `📂 ${selectedGroup} - Ortak Film & Dizi Arşivi`
                    : `👤 ${currentUser} - Kişisel Film & Dizi Arşivim`}
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {activeTab === "shared"
                    ? `Bu liste yalnızca "${selectedGroup}" grubundaki arkadaşlarınla ortaktır.`
                    : "Bu liste sadece sana özeldir. İstediğin yapımı ekleyip çıkarabilirsin."}
                </p>
              </div>
              {!isGuest && (
                <button
                  onClick={() => {
                    setAddTarget(activeTab === "shared" ? "shared" : "personal");
                    setShowAddModal(true);
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl transition"
                >
                  {activeTab === "shared"
                    ? `+ ${selectedGroup} Listesine Ekle`
                    : "+ Kişisel Listeme Ekle"}
                </button>
              )}
            </div>

            {/* Arama ve Kategori Filtreleri */}
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Arşivde film veya dizi ara..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="flex-1 min-w-[220px] bg-[#131b2e] border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-[#131b2e] border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white"
              >
                <option value="Tümü">Tüm Kategoriler</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={watchedFilter}
                onChange={(e) => setWatchedFilter(e.target.value as any)}
                className="bg-[#131b2e] border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white"
              >
                <option value="all">Tümü (İzlenen + İzlenmeyen)</option>
                <option value="watched">Sadece İzlenenler</option>
                <option value="unwatched">İzlenecekler Listesi</option>
              </select>
            </div>

            {/* Film & Dizi Kartları (Silme ve Kurucu Efsanesi Butonlu) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedMedia.map((item) => {
                const canDelete =
                  !isGuest &&
                  (isFounder ||
                    !item.is_shared_club ||
                    item.owner?.toLowerCase() === currentUser.toLowerCase());

                return (
                  <div
                    key={item.id}
                    className="bg-[#131b2e] border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-gray-700 transition"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {item.poster_url ? (
                        <img
                          src={item.poster_url}
                          alt={item.title}
                          className="w-14 h-20 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-20 bg-gray-800 rounded-lg flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                          🎬
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3
                          className={`font-bold text-sm truncate ${
                            item.watched ? "line-through text-gray-400" : "text-white"
                          }`}
                        >
                          {item.title}{" "}
                          {item.release_year ? `(${item.release_year})` : ""}
                        </h3>
                        <p className="text-xs text-amber-400 mt-1">
                          ★ {item.rating}/10 ({item.category})
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Öneren: {item.owner}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isFounder && (
                        <button
                          onClick={() => toggleLegendStatus(item, true)}
                          title="Kurucunun Efsanelerine Ekle / Çıkar"
                          className={`px-2 py-1.5 rounded-lg text-xs font-bold transition ${
                            item.is_legend
                              ? "bg-amber-500 text-black"
                              : "bg-gray-800 text-gray-400 hover:text-amber-400"
                          }`}
                        >
                          👑
                        </button>
                      )}
                      <input
                        type="checkbox"
                        checked={item.watched}
                        onChange={() => toggleWatched(item)}
                        title="İzlendi olarak işaretle"
                        className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                      />
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteMedia(item)}
                          title="Listeden Çıkar (Sil)"
                          className="p-1.5 rounded-lg bg-red-900/30 hover:bg-red-700 text-red-300 text-xs transition"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. BUGÜN NE İZLESEK? (AKILLI GRUP ÖNERİ MOTORU) */}
        {activeTab === "whatToWatch" && (
          <div className="max-w-3xl mx-auto bg-[#131b2e] border border-gray-800 rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-amber-500">
                🎲 Bugün Ne İzlesek? (Grup Karar Motoru)
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Grubunu ve istediğin türü seç; gruptakilerin izlemediği ortak yapımları veya grubun zevkine en uygun TMDB önerisini bulalım!
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  HANGİ GRUPTAYIZ?
                </label>
                <select
                  value={wheelGroup}
                  onChange={(e) => setWheelGroup(e.target.value)}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white"
                >
                  {userGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  HANGİ TÜR İZLEYELİM?
                </label>
                <select
                  value={wheelGenre}
                  onChange={(e) => setWheelGenre(e.target.value)}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white"
                >
                  <option value="Tümü">Fark Etmez (Tüm Türler)</option>
                  <option value="Dram">Dram</option>
                  <option value="Komedi">Komedi</option>
                  <option value="Aksiyon">Aksiyon</option>
                  <option value="Korku">Korku</option>
                  <option value="Bilim Kurgu / Gerilim">Bilim Kurgu / Gerilim</option>
                  <option value="Animasyon">Animasyon</option>
                  <option value="Dizi">Dizi</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  ÖNERİ KAYNAĞI
                </label>
                <select
                  value={wheelMode}
                  onChange={(e) => setWheelMode(e.target.value as any)}
                  className="w-full bg-[#0b0f17] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white"
                >
                  <option value="archive">Grup Arşivinden (İzlenmemişler)</option>
                  <option value="tmdb">TMDB Keşif (Grubun Hiç İzlemediği)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSpinWheel}
              disabled={isSpinning}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-3.5 rounded-xl text-base transition"
            >
              {isSpinning ? "🎬 Kadraj Çevriliyor..." : "🎲 Kadrajı Çevir & Film Öner"}
            </button>

            {wheelReason && (
              <div className="bg-[#0b0f17] border border-amber-500/40 rounded-xl p-5 space-y-4">
                <p className="text-xs text-amber-400 font-semibold">{wheelReason}</p>
                {wheelResult && (
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    {wheelResult.poster_url && (
                      <img
                        src={wheelResult.poster_url}
                        alt={wheelResult.title}
                        className="w-32 h-48 object-cover rounded-xl"
                      />
                    )}
                    <div className="space-y-2 text-center sm:text-left">
                      <h3 className="text-2xl font-bold text-white">
                        {wheelResult.title}{" "}
                        {wheelResult.release_year
                          ? `(${wheelResult.release_year})`
                          : ""}
                      </h3>
                      <p className="text-sm text-amber-400">
                        ★ {wheelResult.rating}/10 • {wheelResult.category}
                      </p>
                      {wheelResult.overview && (
                        <p className="text-xs text-gray-300 leading-relaxed">
                          {wheelResult.overview}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. TARTIŞMA ODALARI (MÜKERRER FİLMLER BİRLEŞTİRİLDİ + DİZİ SEZON/BÖLÜM YORUMU) */}
        {activeTab === "discussions" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#131b2e] border border-gray-800 rounded-2xl p-4 h-[620px] flex flex-col">
              <h3 className="text-amber-500 font-bold text-sm mb-3">YAPIM SEÇ</h3>
              <input
                type="text"
                placeholder="Film veya dizi ara..."
                value={discussionSearch}
                onChange={(e) => setDiscussionSearch(e.target.value)}
                className="bg-[#0b0f17] border border-gray-700 rounded-xl px-3 py-2 text-sm text-white mb-3"
              />
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {uniqueDiscussionMovies.map((m) => {
                  const isSelected =
                    selectedDiscussionTitle.trim().toLowerCase() ===
                    m.title.trim().toLowerCase();
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedDiscussionTitle(m.title)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-between ${
                        isSelected
                          ? "bg-amber-500 text-black font-bold"
                          : "bg-[#0b0f17] text-gray-200 hover:bg-gray-800"
                      }`}
                    >
                      <span className="truncate">🎬 {m.title}</span>
                      {m.category === "Dizi" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 ml-2">
                          Dizi
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-2 bg-[#131b2e] border border-gray-800 rounded-2xl p-6 flex flex-col h-[620px]">
              {!selectedDiscussionTitle ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                  Soldaki listeden yorumlarını görmek veya tartışmak istediğin yapımı seç.
                </div>
              ) : (
                <>
                  <div className="border-b border-gray-800 pb-4 mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        💬 {selectedDiscussionTitle}
                      </h3>
                      <p className="text-xs text-gray-400">
                        Dizi bölümleri için sezon/bölüm filtresi seçerek spoiler yemeden okuyabilirsin.
                      </p>
                    </div>

                    {/* Sezon / Bölüm Filtresi */}
                    <div className="flex items-center gap-2">
                      <select
                        value={filterSeason}
                        onChange={(e) =>
                          setFilterSeason(
                            e.target.value === "all" ? "all" : Number(e.target.value)
                          )
                        }
                        className="bg-[#0b0f17] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="all">Tüm Sezonlar</option>
                        {Array.from({ length: 15 }, (_, i) => i + 1).map((s) => (
                          <option key={s} value={s}>
                            {s}. Sezon
                          </option>
                        ))}
                      </select>
                      <select
                        value={filterEpisode}
                        onChange={(e) =>
                          setFilterEpisode(
                            e.target.value === "all" ? "all" : Number(e.target.value)
                          )
                        }
                        className="bg-[#0b0f17] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="all">Tüm Bölümler</option>
                        {Array.from({ length: 100 }, (_, i) => i + 1).map((ep) => (
                          <option key={ep} value={ep}>
                            {ep}. Bölüm
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Yorum Listesi */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
                    {comments
                      .filter((c) => selectedMovieIds.includes(String(c.media_id)))
                      .filter((c) =>
                        filterSeason === "all" ? true : c.season_num === filterSeason
                      )
                      .filter((c) =>
                        filterEpisode === "all"
                          ? true
                          : c.episode_num === filterEpisode
                      )
                      .map((c) => {
                        const isHidden = c.is_spoiler && !revealedSpoilers[c.id];
                        return (
                          <div
                            key={c.id}
                            className={`p-3.5 rounded-xl border border-gray-800 bg-[#0b0f17] ${
                              c.parent_id ? "ml-6 border-l-2 border-l-amber-500" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-amber-400">
                                  {c.username}
                                </span>
                                {(c.season_num || c.episode_num) && (
                                  <span className="bg-blue-900/40 text-blue-300 border border-blue-700/40 px-2 py-0.5 rounded text-[10px]">
                                    {c.season_num ? `S${c.season_num}` : ""}
                                    {c.episode_num ? ` B${c.episode_num}` : ""}
                                  </span>
                                )}
                              </div>
                              {!isGuest && (
                                <button
                                  onClick={() => setReplyToId(c.id)}
                                  className="text-amber-500 hover:underline"
                                >
                                  Yanıtla
                                </button>
                              )}
                            </div>

                            {isHidden ? (
                              <button
                                onClick={() =>
                                  setRevealedSpoilers({
                                    ...revealedSpoilers,
                                    [c.id]: true,
                                  })
                                }
                                className="text-xs bg-red-950/60 border border-red-800/60 text-red-300 px-3 py-1.5 rounded-lg mt-1"
                              >
                                ⚠️ Spoiler İçerir (Görmek için tıkla)
                              </button>
                            ) : (
                              <p className="text-sm text-gray-200">{c.content}</p>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {/* Yorum Yazma Formu */}
                  {!isGuest && (
                    <form onSubmit={handleAddComment} className="space-y-2.5">
                      {replyToId && (
                        <div className="text-xs text-amber-400 flex items-center justify-between bg-amber-500/10 px-3 py-1 rounded">
                          <span>Bir yoruma yanıt yazıyorsunuz...</span>
                          <button
                            type="button"
                            onClick={() => setReplyToId(null)}
                            className="text-red-400"
                          >
                            İptal
                          </button>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={commentSeason}
                          onChange={(e) =>
                            setCommentSeason(
                              e.target.value === "" ? "" : Number(e.target.value)
                            )
                          }
                          className="bg-[#0b0f17] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        >
                          <option value="">Genel (Sezon Seçme)</option>
                          {Array.from({ length: 15 }, (_, i) => i + 1).map((s) => (
                            <option key={s} value={s}>
                              {s}. Sezon
                            </option>
                          ))}
                        </select>
                        <select
                          value={commentEpisode}
                          onChange={(e) =>
                            setCommentEpisode(
                              e.target.value === "" ? "" : Number(e.target.value)
                            )
                          }
                          className="bg-[#0b0f17] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        >
                          <option value="">Genel (Bölüm Seçme)</option>
                          {Array.from({ length: 100 }, (_, i) => i + 1).map((ep) => (
                            <option key={ep} value={ep}>
                              {ep}. Bölüm
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer ml-auto">
                          <input
                            type="checkbox"
                            checked={newCommentSpoiler}
                            onChange={(e) => setNewCommentSpoiler(e.target.checked)}
                            className="accent-amber-500"
                          />
                          Spoiler Koruması Ekle
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Yorumunuzu yazın..."
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          className="flex-1 bg-[#0b0f17] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white"
                        />
                        <button
                          type="submit"
                          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl text-sm"
                        >
                          Gönder
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 5. GRUPLAR & DAVET YÖNETİMİ */}
        {activeTab === "invites" && !isGuest && (
          <div className="bg-[#131b2e] border border-gray-800 rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-amber-500">
                🔑 Çoklu Grup & Davet Kodu Yönetimi
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                Arkadaş çevrene özel yeni bir grup adı yazarak (Örn: Konya Grubu) davet kodu üretebilirsin. O kodla girenler doğrudan o grubun ortak arşivine bağlanır.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3 bg-[#0b0f17] p-4 rounded-xl border border-gray-800">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-gray-400 mb-1">
                  HEDEF GRUP ADI (Yeni veya Mevcut Grup)
                </label>
                <input
                  type="text"
                  placeholder="Örn: Konya Grubu"
                  value={newInviteGroupName}
                  onChange={(e) => setNewInviteGroupName(e.target.value)}
                  className="w-full bg-[#131b2e] border border-gray-700 rounded-lg px-3.5 py-2 text-sm text-white"
                />
              </div>
              <button
                onClick={() => generateInviteCode(false)}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                + Bu Grup İçin Davet Kodu Üret
              </button>
              <button
                onClick={() => generateInviteCode(true)}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-lg text-sm"
              >
                🐔 Tek Kullanımlık &quot;Gezen Davuk&quot; Linki Kopyala
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="bg-[#0b0f17] border border-gray-800 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <span className="font-mono font-bold text-amber-400 text-lg">
                      {inv.code}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Grup: <strong className="text-white">{inv.group_name || "Genel Kulüp"}</strong>
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full ${
                      inv.is_used
                        ? "bg-gray-800 text-gray-400"
                        : "bg-green-900/40 text-green-300"
                    }`}
                  >
                    {inv.is_used ? `Kullanan: ${inv.used_by}` : "Aktif Kod"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* YENİ FİLM / DİZİ EKLEME MODALI */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-[#131b2e] border border-gray-700 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-amber-500">
                {addTarget === "shared"
                  ? `📂 ${selectedGroup} Ortak Arşivine Ekle`
                  : "👤 Kişisel Arşivime Ekle"}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* TMDB Arama */}
            <div className="relative">
              <input
                type="text"
                placeholder="TMDB'den otomatik afişli film/dizi ara..."
                value={tmdbQuery}
                onChange={(e) => setTmdbQuery(e.target.value)}
                className="w-full bg-[#0b0f17] border border-amber-500/50 rounded-xl px-4 py-2.5 text-sm text-white"
              />
              {tmdbResults.length > 0 && (
                <div className="absolute left-0 right-0 top-12 bg-[#0b0f17] border border-gray-700 rounded-xl max-h-60 overflow-y-auto z-50 divide-y divide-gray-800">
                  {tmdbResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => selectTmdbItem(r)}
                      className="w-full text-left p-2.5 hover:bg-gray-800 flex items-center gap-3"
                    >
                      {r.poster_path && (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                          alt=""
                          className="w-8 h-12 object-cover rounded"
                        />
                      )}
                      <div>
                        <p className="text-sm font-bold text-white">
                          {r.title || r.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {r.media_type === "tv" ? "Dizi" : "Film"} •{" "}
                          {(r.release_date || r.first_air_date || "").slice(0, 4)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleAddMedia} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Yapım Adı"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-[#0b0f17] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="bg-[#0b0f17] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={newRating}
                  onChange={(e) => setNewRating(Number(e.target.value))}
                  className="bg-[#0b0f17] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white"
                  placeholder="Puan (1-10)"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newWatched}
                    onChange={(e) => setNewWatched(e.target.checked)}
                    className="accent-amber-500"
                  />
                  İzledim olarak işaretle
                </label>

                <label className="flex items-center gap-2 text-xs text-amber-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsLegend}
                    onChange={(e) => setNewIsLegend(e.target.checked)}
                    className="accent-amber-500"
                  />
                  🏆 Efsanelerim Vitrinine Ekle
                </label>
              </div>

              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition mt-2"
              >
                Kaydet
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TMDB Yasal Atıf Footer */}
      <footer className="border-t border-gray-800/80 py-5 px-4 text-center text-xs text-gray-500">
        <p>
          <strong>KADRAJ</strong> — Özel Sinema & Dizi Kulübü • Bu ürün TMDB API
          kullanmaktadır ancak TMDB tarafından onaylanmamış veya
          sertifikalandırılmamıştır.
        </p>
      </footer>
    </div>
  );
}