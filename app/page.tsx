"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
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
  poster_url?: string | null;
  poster?: string | null;
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

const TITLE_ALIASES: Record<string, string> = {
  "f**** c***": "Fight Club",
  "fordvferrari": "Ford v Ferrari",
  "the gentelman": "The Gentlemen",
  "godfather 1": "The Godfather",
  "v for vandeta": "V for Vendetta",
  "bıcaklar cekildi": "Bıçaklar Çekildi",
  "bicaklar cekildi": "Bıçaklar Çekildi",
};

const fetchPosterFromTmdb = async (rawTitle: string): Promise<string | null> => {
  if (!TMDB_API_KEY || !rawTitle) return null;
  const lower = rawTitle.trim().toLowerCase();
  const cleanQuery = (TITLE_ALIASES[lower] || rawTitle)
    .replace(/\(\d{4}\)/g, "")
    .trim();

  try {
    const resTr = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=tr-TR&query=${encodeURIComponent(
        cleanQuery
      )}`
    );
    const dataTr = await resTr.json();
    const matchTr = (dataTr.results || []).find(
      (r: any) =>
        (r.media_type === "movie" || r.media_type === "tv") && r.poster_path
    );
    if (matchTr?.poster_path) {
      return `https://image.tmdb.org/t/p/w500${matchTr.poster_path}`;
    }

    const resEn = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=en-US&query=${encodeURIComponent(
        cleanQuery
      )}`
    );
    const dataEn = await resEn.json();
    const matchEn = (dataEn.results || []).find(
      (r: any) =>
        (r.media_type === "movie" || r.media_type === "tv") && r.poster_path
    );
    if (matchEn?.poster_path) {
      return `https://image.tmdb.org/t/p/w500${matchEn.poster_path}`;
    }
  } catch (err) {
    console.error("TMDB afiş hatası:", err);
  }
  return null;
};

const formatRuntime = (minutes?: number) => {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${minutes} dk (${h} sa ${m} dk)` : `${minutes} dk`;
};

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

  // Her Zaman Görünür Üst TMDB Hızlı Arama State'leri
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<any[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [quickToast, setQuickToast] = useState<string>("");

  // Yapım Detay Modalı State'leri
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [detailRawTmdbItem, setDetailRawTmdbItem] = useState<any | null>(null);
  const [selectedDetailSeason, setSelectedDetailSeason] = useState<number>(1);
  const [seasonEpisodes, setSeasonEpisodes] = useState<any[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [detailCommentText, setDetailCommentText] = useState("");
  const [detailCommentSpoiler, setDetailCommentSpoiler] = useState(false);

  // Afiş senkronizasyon state'leri
  const [isSyncingPosters, setIsSyncingPosters] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const autoSyncedRef = useRef(false);

  // Detaylı Ekleme Modalı State'leri
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
  const [newRecommendedBy, setNewRecommendedBy] = useState("");

  // Arşiv Filtreleri
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

  const isFounder = useMemo(() => {
    return currentUser?.trim().toLowerCase() === "duhan";
  }, [currentUser]);

  const missingPosterCount = useMemo(() => {
    return mediaItems.filter((m) => !(m.poster_url || m.poster)).length;
  }, [mediaItems]);

  const showNotification = (msg: string) => {
    setQuickToast(msg);
    setTimeout(() => setQuickToast(""), 3500);
  };

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

  // Üst Global TMDB Arama Çubuğu Efekti
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (globalSearchQuery.trim().length < 2) {
        setGlobalSearchResults([]);
        return;
      }
      if (!TMDB_API_KEY) return;
      setIsSearchingGlobal(true);
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=tr-TR&query=${encodeURIComponent(
            globalSearchQuery
          )}`
        );
        const data = await res.json();
        setGlobalSearchResults(
          (data.results || [])
            .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
            .slice(0, 8)
        );
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearchQuery]);

  // Dizi Sezon Bölümlerini Çekme
  const loadTvSeasonEpisodes = async (tvId: number, seasonNum: number) => {
    if (!TMDB_API_KEY) return;
    setLoadingEpisodes(true);
    setSelectedDetailSeason(seasonNum);
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=tr-TR`
      );
      const data = await res.json();
      setSeasonEpisodes(data.episodes || []);
    } catch (err) {
      console.error(err);
      setSeasonEpisodes([]);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  // Film veya Dizi Detay Penceresini Açma
  const openMediaDetail = async (input: {
    tmdbId?: number;
    mediaType?: "movie" | "tv";
    title: string;
    posterUrl?: string | null;
    rawTmdbItem?: any;
  }) => {
    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    setSeasonEpisodes([]);
    setDetailRawTmdbItem(input.rawTmdbItem || null);

    if (!TMDB_API_KEY) {
      setDetailData({
        title: input.title,
        overview: "TMDB API anahtarı bulunamadı.",
        poster_url: input.posterUrl,
      });
      setDetailLoading(false);
      return;
    }

    try {
      let targetId = input.tmdbId;
      let targetType = input.mediaType;

      if (!targetId || !targetType) {
        const lower = input.title.trim().toLowerCase();
        const cleanQuery = (TITLE_ALIASES[lower] || input.title)
          .replace(/\(\d{4}\)/g, "")
          .trim();
        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=tr-TR&query=${encodeURIComponent(
            cleanQuery
          )}`
        );
        const searchJson = await searchRes.json();
        const firstMatch = (searchJson.results || []).find(
          (r: any) => r.media_type === "movie" || r.media_type === "tv"
        );
        if (firstMatch) {
          targetId = firstMatch.id;
          targetType = firstMatch.media_type;
          if (!input.rawTmdbItem) {
            setDetailRawTmdbItem(firstMatch);
          }
        }
      }

      if (!targetId || !targetType) {
        setDetailData({
          title: input.title,
          overview: "Bu yapım için TMDB detay bilgisi bulunamadı.",
          poster_url: input.posterUrl,
        });
        setDetailLoading(false);
        return;
      }

      const resTr = await fetch(
        `https://api.themoviedb.org/3/${targetType}/${targetId}?api_key=${TMDB_API_KEY}&language=tr-TR&append_to_response=external_ids`
      );
      const dataTr = await resTr.json();

      let finalOverview = dataTr.overview;
      if (!finalOverview) {
        const resEn = await fetch(
          `https://api.themoviedb.org/3/${targetType}/${targetId}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        const dataEn = await resEn.json();
        finalOverview = dataEn.overview || "Konu özeti bulunmuyor.";
      }

      const validSeasons = (dataTr.seasons || []).filter(
        (s: any) => s.season_number > 0
      );

      const enriched = {
        tmdbId: targetId,
        mediaType: targetType,
        title: dataTr.title || dataTr.name || input.title,
        originalTitle: dataTr.original_title || dataTr.original_name,
        overview: finalOverview,
        voteAverage: dataTr.vote_average,
        imdbId: dataTr.external_ids?.imdb_id,
        releaseYear: (dataTr.release_date || dataTr.first_air_date || "").slice(0, 4),
        genres: (dataTr.genres || []).map((g: any) => g.name).join(", "),
        runtime: dataTr.runtime,
        numberOfSeasons: dataTr.number_of_seasons,
        numberOfEpisodes: dataTr.number_of_episodes,
        seasons: validSeasons,
        poster_url: dataTr.poster_path
          ? `https://image.tmdb.org/t/p/w500${dataTr.poster_path}`
          : input.posterUrl,
      };

      setDetailData(enriched);

      if (targetType === "tv" && validSeasons.length > 0) {
        const firstSeasonNum = validSeasons[0].season_number;
        await loadTvSeasonEpisodes(targetId, firstSeasonNum);
      }
    } catch (err) {
      console.error("Detay yükleme hatası:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Detay Penceresindeki Yapım İçin Gruplardaki Üye Yorumları
  const detailComments = useMemo(() => {
    if (!detailData?.title) return [];
    const targetKey = detailData.title.trim().toLowerCase();
    const matchingMediaIds = mediaItems
      .filter((m) => m.title.trim().toLowerCase() === targetKey)
      .map((m) => String(m.id));
    if (matchingMediaIds.length === 0) return [];
    return comments.filter((c) => matchingMediaIds.includes(String(c.media_id)));
  }, [detailData, mediaItems, comments]);

  // Detay Penceresinin Altından Yorum Gönderme
  const handleAddCommentFromDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailCommentText.trim() || !detailData?.title || !currentUser || isGuest)
      return;

    const targetKey = detailData.title.trim().toLowerCase();
    let existingMedia = mediaItems.find(
      (m) => m.title.trim().toLowerCase() === targetKey
    );

    if (!existingMedia) {
      const { data: created, error } = await supabase
        .from("media_items")
        .insert([
          {
            title: detailData.title,
            category: detailData.mediaType === "tv" ? "Dizi" : "Yabancı Dram",
            rating: Math.max(1, Math.round(detailData.voteAverage || 8)),
            watched: false,
            poster_url: detailData.poster_url || null,
            release_year: detailData.releaseYear || null,
            owner: newRecommendedBy.trim() || currentUser.trim(),
            is_shared_club: true,
            is_legend: false,
            group_name: selectedGroup,
          },
        ])
        .select()
        .single();

      if (error || !created) return;
      existingMedia = created;
      setMediaItems((prev) => [created, ...prev]);
    }

    const { data: newComment, error: cErr } = await supabase
      .from("comments")
      .insert([
        {
          media_id: existingMedia!.id,
          username: currentUser,
          content: detailCommentText.trim(),
          is_spoiler: detailCommentSpoiler,
          parent_id: null,
          group_name: selectedGroup,
        },
      ])
      .select()
      .single();

    if (!cErr && newComment) {
      setComments((prev) => [...prev, newComment]);
      setDetailCommentText("");
      setDetailCommentSpoiler(false);
    }
  };

  // Üst Arama Çubuğundan veya Detay Penceresinden Tek Tıkla Ekleme
  const handleQuickAddFromTopSearch = async (
    item: any,
    mode: "personal" | "shared" | "legend"
  ) => {
    if (!currentUser || isGuest) return;
    const title = (item.title || item.name || "").trim();
    if (!title) return;

    const normalizedTitle = title.toLowerCase();
    const isShared = mode === "shared";
    const targetGrp = isShared ? selectedGroup : "Kişisel";

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
      showNotification(`⚠️ "${title}" zaten seçilen listede mevcut!`);
      return;
    }

    const year = (item.release_date || item.first_air_date || "").slice(0, 4);
    const poster = item.poster_path
      ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
      : null;
    const isTv = item.media_type === "tv";
    const isTr = item.original_language === "tr";
    const category = isTv ? "Dizi" : isTr ? "Türk Dram" : "Yabancı Dram";
    const rating = item.vote_average ? Math.max(1, Math.round(item.vote_average)) : 8;

    const payload = {
      title,
      category,
      rating,
      watched: false,
      poster_url: poster,
      release_year: year || null,
      owner: mode === "legend" && isFounder ? "Duhan" : currentUser.trim(),
      is_shared_club: isShared,
      is_legend: mode === "legend",
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
      setGlobalSearchQuery("");
      setGlobalSearchResults([]);
      if (mode === "shared") {
        showNotification(`✅ "${title}" -> ${selectedGroup} Ortak Arşivine eklendi!`);
      } else if (mode === "legend") {
        showNotification(`👑 "${title}" -> Kurucunun Efsaneleri vitrinine eklendi!`);
      } else {
        showNotification(`✅ "${title}" -> Kişisel Arşivine eklendi!`);
      }
    }
  };

  // Efsanelerim vitrinindeki eksik afişleri otomatik tamamla
  useEffect(() => {
    if (mediaItems.length === 0 || autoSyncedRef.current || !TMDB_API_KEY) return;
    const legendsWithoutPoster = mediaItems.filter(
      (m) => m.is_legend && !(m.poster_url || m.poster)
    );
    if (legendsWithoutPoster.length === 0) return;

    autoSyncedRef.current = true;
    (async () => {
      for (const item of legendsWithoutPoster) {
        const foundUrl = await fetchPosterFromTmdb(item.title);
        if (foundUrl) {
          await supabase
            .from("media_items")
            .update({ poster_url: foundUrl })
            .eq("id", item.id);
          setMediaItems((prev) =>
            prev.map((m) => (m.id === item.id ? { ...m, poster_url: foundUrl } : m))
          );
        }
      }
    })();
  }, [mediaItems]);

  const handleSyncAllPosters = async () => {
    if (isSyncingPosters || !TMDB_API_KEY) return;
    const missing = mediaItems.filter((m) => !(m.poster_url || m.poster));
    if (missing.length === 0) {
      showNotification("Tüm yapımların afişleri zaten yüklü!");
      return;
    }

    setIsSyncingPosters(true);
    let completed = 0;

    for (let i = 0; i < missing.length; i += 5) {
      const batch = missing.slice(i, i + 5);
      await Promise.all(
        batch.map(async (item) => {
          const url = await fetchPosterFromTmdb(item.title);
          if (url) {
            await supabase
              .from("media_items")
              .update({ poster_url: url })
              .eq("id", item.id);
            setMediaItems((prev) =>
              prev.map((m) => (m.id === item.id ? { ...m, poster_url: url } : m))
            );
          }
          completed += 1;
          setSyncProgress(`${completed} / ${missing.length}`);
        })
      );
      await new Promise((r) => setTimeout(r, 250));
    }

    setIsSyncingPosters(false);
    setSyncProgress("");
  };

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
    showNotification(`✅ "${inv.group_name}" grubuna başarıyla katıldın!`);
  };

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

  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentUser || isGuest) return;

    const normalizedTitle = newTitle.trim().toLowerCase();
    const isShared = addTarget === "shared";
    const targetGrp = isShared ? selectedGroup : "Kişisel";

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

    let finalPoster = newPoster;
    if (!finalPoster) {
      finalPoster = (await fetchPosterFromTmdb(newTitle.trim())) || "";
    }

    const payload = {
      title: newTitle.trim(),
      category: newCategory,
      rating: newRating,
      watched: newWatched,
      poster_url: finalPoster || null,
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
      showNotification(`✅ "${data.title}" listeye eklendi!`);
    }
    setNewTitle("");
    setNewPoster("");
    setNewYear("");
    setNewIsLegend(false);
    setShowAddModal(false);
  };

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
    showNotification(`🗑️ "${item.title}" listeden çıkarıldı.`);
  };

  const toggleWatched = async (item: MediaItem) => {
    if (isGuest) return;
    const updated = !item.watched;
    await supabase.from("media_items").update({ watched: updated }).eq("id", item.id);
    setMediaItems((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, watched: updated } : m))
    );
  };

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

  const selectedMovieIds = useMemo(() => {
    if (!selectedDiscussionTitle) return [];
    const targetKey = selectedDiscussionTitle.trim().toLowerCase();
    return mediaItems
      .filter((m) => m.title.trim().toLowerCase() === targetKey)
      .map((m) => String(m.id));
  }, [mediaItems, selectedDiscussionTitle]);

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
          let poster = picked.poster_url || picked.poster || "";
          if (!poster) {
            poster = (await fetchPosterFromTmdb(picked.title)) || "";
          }
          setWheelResult({
            title: picked.title,
            poster_url: poster,
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
              tmdbId: picked.id,
              mediaType: "movie",
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

  // Davet Kodunu Silme
  const handleDeleteInvite = async (inv: InviteItem) => {
    if (isGuest) return;
    const confirmed = window.confirm(
      `"${inv.code}" davet kodunu listeden kalıcı olarak silmek istediğinize emin misiniz?`
    );
    if (!confirmed) return;

    const { error } = await supabase.from("invites").delete().eq("id", inv.id);
    if (error) {
      alert("Davet kodu silinemedi: " + error.message);
      return;
    }
    setInvites((prev) => prev.filter((item) => item.id !== inv.id));
    showNotification(`🗑️ "${inv.code}" davet kodu silindi.`);
  };

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
      <header className="border-b border-gray-800 bg-[#111827]/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
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

        {/* HER SEKMEDE GÖRÜNÜR CANLI TMDB FİLM & DİZİ ARAMA ÇUBUĞU */}
        <div className="border-t border-gray-800/80 bg-[#0d1320] px-4 py-3">
          <div className="max-w-7xl mx-auto relative">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[260px]">
                <input
                  type="text"
                  placeholder="🔍 Film veya dizi ara (Konusunu, puanını, sezon/bölümlerini ve üye yorumlarını görmek için tıkla)..."
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                  className="w-full bg-[#131b2e] border border-amber-500/40 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                />
                {globalSearchQuery && (
                  <button
                    onClick={() => {
                      setGlobalSearchQuery("");
                      setGlobalSearchResults([]);
                    }}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
              <span className="text-xs text-gray-400 hidden sm:inline">
                Aktif Grup: <strong className="text-amber-400">{selectedGroup}</strong>
              </span>
            </div>

            {/* Canlı Arama Sonuç Açılır Penceresi */}
            {globalSearchQuery.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-12 bg-[#131b2e] border border-amber-500/40 rounded-2xl shadow-2xl max-h-96 overflow-y-auto z-50 divide-y divide-gray-800">
                {!TMDB_API_KEY ? (
                  <div className="p-4 text-xs text-red-300">
                    ⚠️ TMDB API anahtarı bulunamadı. Lütfen Vercel ayarlarından{" "}
                    <code>NEXT_PUBLIC_TMDB_API_KEY</code> değişkenini ekleyin.
                  </div>
                ) : isSearchingGlobal ? (
                  <div className="p-4 text-xs text-gray-400">
                    TMDB veritabanında aranıyor...
                  </div>
                ) : globalSearchResults.length === 0 ? (
                  <div className="p-4 text-xs text-gray-400">
                    &quot;{globalSearchQuery}&quot; için sonuç bulunamadı.
                  </div>
                ) : (
                  globalSearchResults.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 flex flex-wrap items-center justify-between gap-3 hover:bg-[#0b0f17]/80 transition"
                    >
                      <div
                        onClick={() => {
                          openMediaDetail({
                            tmdbId: r.id,
                            mediaType: r.media_type,
                            title: r.title || r.name,
                            posterUrl: r.poster_path
                              ? `https://image.tmdb.org/t/p/w500${r.poster_path}`
                              : null,
                            rawTmdbItem: r,
                          });
                          setGlobalSearchQuery("");
                          setGlobalSearchResults([]);
                        }}
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
                      >
                        {r.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                            alt=""
                            className="w-10 h-14 object-cover rounded-lg flex-shrink-0 group-hover:ring-2 group-hover:ring-amber-500"
                          />
                        ) : (
                          <div className="w-10 h-14 bg-gray-800 rounded-lg flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                            🎬
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white group-hover:text-amber-400 truncate transition">
                            {r.title || r.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {r.media_type === "tv" ? "📺 Dizi" : "🎬 Film"} •{" "}
                            {(r.release_date || r.first_air_date || "").slice(0, 4) ||
                              "Yıl Yok"}{" "}
                            • ★ {r.vote_average ? r.vote_average.toFixed(1) : "-"}{" "}
                            <span className="text-amber-400/80 underline ml-1">
                              (Detay & Yorumlar)
                            </span>
                          </p>
                        </div>
                      </div>

                      {!isGuest && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() =>
                              handleQuickAddFromTopSearch(r, "personal")
                            }
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition"
                          >
                            + Kişisel Arşive
                          </button>
                          <button
                            onClick={() =>
                              handleQuickAddFromTopSearch(r, "shared")
                            }
                            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-amber-400 border border-amber-500/30 font-semibold text-xs transition"
                          >
                            + {selectedGroup}
                          </button>
                          <button
  onClick={() => {
    selectTmdbItem(r);
    setNewRecommendedBy(currentUser || "");
    setAddTarget("shared");
    setShowAddModal(true);
    setGlobalSearchQuery("");
    setGlobalSearchResults([]);
  }}
  className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 font-semibold text-xs transition"
>
  📝 Öneren Seçerek Ekle
</button>
                          {isFounder && (
                            <button
                              onClick={() =>
                                handleQuickAddFromTopSearch(r, "legend")
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-500/30 font-semibold text-xs transition"
                            >
                              👑 Efsane Yap
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Bildirim Toast */}
      {quickToast && (
        <div className="fixed bottom-5 right-5 bg-amber-500 text-black font-bold text-sm px-5 py-3 rounded-xl shadow-2xl z-50">
          {quickToast}
        </div>
      )}

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
                      ? "Kurucu yetkisi aktif: Kartlara tıklayarak detay ve yorumları görebilir, yanlış filmleri çıkarabilirsin."
                      : "Kulüp kurucusu Duhan tarafından seçilen başyapıtlar. Detay ve yorumlar için üzerine tıkla."}
                  </p>
                </div>

                {isFounder && missingPosterCount > 0 && (
                  <button
                    onClick={handleSyncAllPosters}
                    disabled={isSyncingPosters}
                    className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-xs transition"
                  >
                    {isSyncingPosters
                      ? `🖼️ Afişler Çekiliyor (${syncProgress})...`
                      : `🖼️ Eksik Afişleri Tamamla (${missingPosterCount})`}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {founderLegends.map((item) => {
                  const posterSrc = item.poster_url || item.poster;
                  return (
                    <div
                      key={item.id}
                      className="bg-[#0b0f17] border border-gray-800 rounded-xl overflow-hidden flex flex-col justify-between group hover:border-amber-500/50 transition"
                    >
                      <div
                        onClick={() =>
                          openMediaDetail({
                            title: item.title,
                            mediaType: item.category === "Dizi" ? "tv" : undefined,
                            posterUrl: posterSrc,
                          })
                        }
                        className="cursor-pointer"
                      >
                        {posterSrc ? (
                          <img
                            src={posterSrc}
                            alt={item.title}
                            className="w-full h-56 object-cover group-hover:opacity-90 transition"
                          />
                        ) : (
                          <div className="w-full h-56 bg-gray-900 flex items-center justify-center text-gray-500 text-xs">
                            Afiş Yükleniyor...
                          </div>
                        )}
                        <div className="p-3">
                          <h3 className="font-bold text-sm text-white group-hover:text-amber-400 line-clamp-1">
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
                  );
                })}
              </div>
            </div>

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
                      onClick={() =>
                        openMediaDetail({
                          title: item.title,
                          mediaType: item.category === "Dizi" ? "tv" : undefined,
                          posterUrl: item.poster_url || item.poster,
                        })
                      }
                      className="bg-[#0b0f17] border border-gray-800 hover:border-amber-500/50 rounded-xl p-3 cursor-pointer transition"
                    >
                      <h4 className="font-bold text-sm hover:text-amber-400">
                        {item.title}
                      </h4>
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
                      placeholder=""
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

            <div className="bg-[#131b2e] border border-gray-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-amber-500">
                  {activeTab === "shared"
                    ? `📂 ${selectedGroup} - Ortak Film & Dizi Arşivi`
                    : `👤 ${currentUser} - Kişisel Film & Dizi Arşivim`}
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  Konusunu, puanını, sezon/bölümlerini ve yorumlarını görmek için herhangi bir yapımın üzerine tıkla.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isFounder && missingPosterCount > 0 && (
                  <button
                    onClick={handleSyncAllPosters}
                    disabled={isSyncingPosters}
                    className="bg-gray-800 hover:bg-gray-700 text-amber-400 border border-amber-500/40 font-bold px-4 py-2.5 rounded-xl text-xs transition"
                  >
                    {isSyncingPosters
                      ? `🖼️ Afişler Çekiliyor (${syncProgress})...`
                      : `🖼️ Eksik Afişleri Tamamla (${missingPosterCount})`}
                  </button>
                )}
                {!isGuest && (
                  <button
                    onClick={() => {
                      setAddTarget(activeTab === "shared" ? "shared" : "personal");
                      setNewRecommendedBy(currentUser || "");
                      setShowAddModal(true);
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl transition"
                  >
                    {activeTab === "shared"
                      ? `+ ${selectedGroup} Listesine Detaylı Ekle`
                      : "+ Kişisel Listeme Detaylı Ekle"}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Arşiv içi filtrele..."
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedMedia.map((item) => {
                const posterSrc = item.poster_url || item.poster;
                const canDelete =
                  !isGuest &&
                  (isFounder ||
                    !item.is_shared_club ||
                    item.owner?.toLowerCase() === currentUser.toLowerCase());

                return (
                  <div
                    key={item.id}
                    className="bg-[#131b2e] border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-amber-500/40 transition"
                  >
                    <div
                      onClick={() =>
                        openMediaDetail({
                          title: item.title,
                          mediaType: item.category === "Dizi" ? "tv" : undefined,
                          posterUrl: posterSrc,
                        })
                      }
                      className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer group"
                    >
                      {posterSrc ? (
                        <img
                          src={posterSrc}
                          alt={item.title}
                          className="w-14 h-20 object-cover rounded-lg flex-shrink-0 group-hover:ring-2 group-hover:ring-amber-500"
                        />
                      ) : (
                        <div className="w-14 h-20 bg-gray-800 rounded-lg flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                          🎬
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3
                          className={`font-bold text-sm truncate group-hover:text-amber-400 transition ${
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

        {/* 3. BUGÜN NE İZLESEK? */}
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
                  <div
                    onClick={() =>
                      openMediaDetail({
                        tmdbId: wheelResult.tmdbId,
                        mediaType: wheelResult.mediaType,
                        title: wheelResult.title,
                        posterUrl: wheelResult.poster_url,
                      })
                    }
                    className="flex flex-col sm:flex-row items-center gap-5 cursor-pointer group"
                  >
                    {wheelResult.poster_url && (
                      <img
                        src={wheelResult.poster_url}
                        alt={wheelResult.title}
                        className="w-32 h-48 object-cover rounded-xl group-hover:ring-2 group-hover:ring-amber-500"
                      />
                    )}
                    <div className="space-y-2 text-center sm:text-left">
                      <h3 className="text-2xl font-bold text-white group-hover:text-amber-400">
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

        {/* 4. TARTIŞMA ODALARI */}
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
                                {c.group_name && (
                                  <span className="text-[10px] text-gray-500">
                                    ({c.group_name})
                                  </span>
                                )}
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
                Arkadaş çevrene özel yeni bir grup adı yazarak (Örn: Konya Grubu) davet kodu üretebilir veya kullanılmış kodları sağdaki çöp kutusuyla silebilirsin.
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
              {invites.map((inv) => {
                const canDeleteInvite =
                  isFounder ||
                  inv.created_by?.toLowerCase() === currentUser.toLowerCase();

                return (
                  <div
                    key={inv.id}
                    className="bg-[#0b0f17] border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-amber-400 text-lg">
                        {inv.code}
                      </span>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        Grup:{" "}
                        <strong className="text-white">
                          {inv.group_name || "Genel Kulüp"}
                        </strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full ${
                          inv.is_used
                            ? "bg-gray-800 text-gray-400"
                            : "bg-green-900/40 text-green-300"
                        }`}
                      >
                        {inv.is_used ? `Kullanan: ${inv.used_by}` : "Aktif Kod"}
                      </span>
                      {canDeleteInvite && (
                        <button
                          onClick={() => handleDeleteInvite(inv)}
                          title="Bu davet kodunu sil"
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
      </main>

      {/* YAPIM DETAY MODALI */}
      {detailModalOpen && (
        <div
          onClick={() => setDetailModalOpen(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#131b2e] border border-amber-500/40 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            {detailLoading || !detailData ? (
              <div className="p-12 text-center text-gray-300 text-sm">
                🎬 Yapım detayları, sezon/bölüm listesi ve grup yorumları yükleniyor...
              </div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="flex flex-col sm:flex-row gap-6">
                  {detailData.poster_url ? (
                    <img
                      src={detailData.poster_url}
                      alt={detailData.title}
                      className="w-40 h-60 object-cover rounded-xl flex-shrink-0 mx-auto sm:mx-0 shadow-lg"
                    />
                  ) : (
                    <div className="w-40 h-60 bg-gray-800 rounded-xl flex items-center justify-center text-gray-500 text-xs flex-shrink-0 mx-auto sm:mx-0">
                      Afiş Yok
                    </div>
                  )}

                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-2xl font-extrabold text-white">
                          {detailData.title}{" "}
                          {detailData.releaseYear ? `(${detailData.releaseYear})` : ""}
                        </h2>
                        {detailData.originalTitle &&
                          detailData.originalTitle !== detailData.title && (
                            <p className="text-xs text-gray-400">
                              Orijinal Adı: {detailData.originalTitle}
                            </p>
                          )}
                      </div>
                      <button
                        onClick={() => setDetailModalOpen(false)}
                        className="text-gray-400 hover:text-white text-lg px-2"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {detailData.voteAverage > 0 && (
                        <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold px-3 py-1 rounded-full">
                          ★ {detailData.voteAverage.toFixed(1)} / 10 Puan
                        </span>
                      )}
                      {detailData.imdbId && (
                        <a
                          href={`https://www.imdb.com/title/${detailData.imdbId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-yellow-500 text-black font-black px-2.5 py-1 rounded-full hover:bg-yellow-400 transition"
                        >
                          IMDb ↗
                        </a>
                      )}
                      {detailData.mediaType === "movie" &&
                        formatRuntime(detailData.runtime) && (
                          <span className="bg-blue-900/40 border border-blue-700/40 text-blue-200 px-3 py-1 rounded-full">
                            ⏱️ Süre: {formatRuntime(detailData.runtime)}
                          </span>
                        )}
                      {detailData.mediaType === "tv" && (
                        <span className="bg-purple-900/40 border border-purple-700/40 text-purple-200 px-3 py-1 rounded-full">
                          📺 {detailData.numberOfSeasons || 1} Sezon •{" "}
                          {detailData.numberOfEpisodes || "?"} Bölüm
                        </span>
                      )}
                      {detailData.genres && (
                        <span className="bg-gray-800 text-gray-300 px-3 py-1 rounded-full">
                          {detailData.genres}
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
                        Konusu
                      </h4>
                      <p className="text-sm text-gray-200 leading-relaxed">
                        {detailData.overview}
                      </p>
                    </div>

                    {!isGuest && detailRawTmdbItem && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <button
                          onClick={() =>
                            handleQuickAddFromTopSearch(detailRawTmdbItem, "personal")
                          }
                          className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition"
                        >
                          + Kişisel Arşivime Ekle
                        </button>
                        <button
                          onClick={() =>
                            handleQuickAddFromTopSearch(detailRawTmdbItem, "shared")
                          }
                          className="px-3.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-amber-400 border border-amber-500/30 font-semibold text-xs transition"
                        >
                          + {selectedGroup} Ortak Arşivine Ekle
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* DİZİ SEZON & TEK TEK BÖLÜMLER */}
                {detailData.mediaType === "tv" &&
                  detailData.seasons &&
                  detailData.seasons.length > 0 && (
                    <div className="border-t border-gray-800 pt-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-bold text-amber-400">
                          📺 Sezonlar & Tek Tek Bölümler
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {detailData.seasons.map((s: any) => (
                            <button
                              key={s.id || s.season_number}
                              onClick={() =>
                                loadTvSeasonEpisodes(
                                  detailData.tmdbId,
                                  s.season_number
                                )
                              }
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                selectedDetailSeason === s.season_number
                                  ? "bg-amber-500 text-black"
                                  : "bg-[#0b0f17] text-gray-300 border border-gray-700 hover:border-amber-500/50"
                              }`}
                            >
                              {s.season_number}. Sezon ({s.episode_count} Blm)
                            </button>
                          ))}
                        </div>
                      </div>

                      {loadingEpisodes ? (
                        <p className="text-xs text-gray-400 py-4">
                          {selectedDetailSeason}. sezon bölümleri yükleniyor...
                        </p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                          {seasonEpisodes.map((ep: any) => (
                            <div
                              key={ep.id || ep.episode_number}
                              className="bg-[#0b0f17] border border-gray-800 rounded-xl p-3 flex flex-col gap-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-white">
                                  <span className="text-amber-400 mr-1.5">
                                    {ep.episode_number}. Bölüm:
                                  </span>
                                  {ep.name}
                                </span>
                                <span className="text-[11px] text-gray-400 flex-shrink-0">
                                  {ep.runtime ? `${ep.runtime} dk` : ""}{" "}
                                  {ep.air_date ? `• ${ep.air_date}` : ""}
                                </span>
                              </div>
                              {ep.overview && (
                                <p className="text-xs text-gray-400 line-clamp-2">
                                  {ep.overview}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                {/* GRUPLARDAKİ ÜYELERİN YORUMLARI */}
                <div className="border-t border-gray-800 pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">
                      💬 Gruplardaki Üyelerin Yorumları ({detailComments.length})
                    </h3>
                  </div>

                  {detailComments.length === 0 ? (
                    <p className="text-xs text-gray-400 bg-[#0b0f17] p-4 rounded-xl border border-gray-800">
                      Gruplardaki üyeler henüz bu yapım hakkında yorum yazmamış. İlk yorumu aşağıdan sen bırakabilirsin!
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
                      {detailComments.map((c) => {
                        const isHidden = c.is_spoiler && !revealedSpoilers[c.id];
                        return (
                          <div
                            key={c.id}
                            className="bg-[#0b0f17] border border-gray-800 rounded-xl p-3.5"
                          >
                            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-amber-400">
                                  {c.username}
                                </span>
                                {c.group_name && (
                                  <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-[10px]">
                                    📂 {c.group_name}
                                  </span>
                                )}
                                {(c.season_num || c.episode_num) && (
                                  <span className="bg-blue-900/40 text-blue-300 border border-blue-700/40 px-2 py-0.5 rounded text-[10px]">
                                    {c.season_num ? `S${c.season_num}` : ""}
                                    {c.episode_num ? ` B${c.episode_num}` : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isHidden ? (
                              <button
                                onClick={() =>
                                  setRevealedSpoilers({
                                    ...revealedSpoilers,
                                    [c.id]: true,
                                  })
                                }
                                className="text-xs bg-red-950/60 border border-red-800/60 text-red-300 px-3 py-1 rounded-lg mt-1"
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
                  )}

                  {!isGuest && (
                    <form
                      onSubmit={handleAddCommentFromDetail}
                      className="flex flex-wrap items-center gap-2 pt-1"
                    >
                      <input
                        type="text"
                        placeholder={`"${detailData.title}" hakkında düşünceni yaz...`}
                        value={detailCommentText}
                        onChange={(e) => setDetailCommentText(e.target.value)}
                        className="flex-1 min-w-[200px] bg-[#0b0f17] border border-gray-700 rounded-xl px-3.5 py-2 text-xs text-white"
                      />
                      <label className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={detailCommentSpoiler}
                          onChange={(e) =>
                            setDetailCommentSpoiler(e.target.checked)
                          }
                          className="accent-amber-500"
                        />
                        Spoiler
                      </label>
                      <button
                        type="submit"
                        className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl text-xs"
                      >
                        Yorum Gönder
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAYLI EKLEME MODALI */}
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
              <div>
  <label className="block text-xs text-gray-400 mb-1">
    KİM ÖNERDİ?
  </label>
  <input
    type="text"
    list="recommender-list"
    placeholder="Öneren kişinin adı (Örn: Duhan, Ahmet...)"
    value={newRecommendedBy}
    onChange={(e) => setNewRecommendedBy(e.target.value)}
    className="w-full bg-[#0b0f17] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white"
  />
  <datalist id="recommender-list">
    {Array.from(
      new Set(
        [currentUser, ...mediaItems.map((m) => m.owner)].filter(Boolean)
      )
    ).map((person) => (
      <option key={person} value={person} />
    ))}
  </datalist>
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