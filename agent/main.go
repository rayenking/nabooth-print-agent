package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"time"
)

var version = "dev"

func main() {
	port := flag.Int("port", 17890, "localhost UI port")
	api := flag.String("api", DefaultAPIBase, "Nabooth API base URL")
	openBrowser := flag.Bool("open", true, "open browser on start")
	showVer := flag.Bool("version", false, "print version")
	flag.Parse()
	if *showVer {
		fmt.Println(version)
		return
	}

	cfg, err := LoadConfig()
	if err != nil {
		log.Printf("config load: %v (using defaults)", err)
		cfg = DefaultConfig(normalizeAPIBase(*api))
	}
	if cfg.APIBase == "" {
		cfg.APIBase = normalizeAPIBase(*api)
	}
	if cfg.APIBase == "" {
		cfg.APIBase = DefaultAPIBase
	}

	ag := NewAgent(cfg, version)
	srv := NewServer(ag, *port)
	url := fmt.Sprintf("http://127.0.0.1:%d", *port)
	log.Printf("Nabooth Print Agent %s — UI %s", version, url)

	go ag.MaybeAutoConnect()

	if *openBrowser {
		go func() {
			time.Sleep(400 * time.Millisecond)
			_ = OpenURL(url)
		}()
	}

	if err := srv.ListenAndServe(); err != nil {
		log.Println(err)
		os.Exit(1)
	}
}
